import { supabase } from '../supabaseClient';
import { db } from './database';
import type { Habit, HabitEntry } from './database';
import { registerSyncTrigger as registerHabitSync } from './habits';
import { registerSyncTrigger as registerEntrySync } from './entries';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
let currentSyncStatus: SyncStatus = 'idle';
const syncListeners = new Set<(status: SyncStatus) => void>();

export function onSyncStatusChange(callback: (status: SyncStatus) => void) {
  syncListeners.add(callback);
  callback(currentSyncStatus);
  return () => { syncListeners.delete(callback); };
}

function setSyncStatus(status: SyncStatus) {
  currentSyncStatus = status;
  syncListeners.forEach(cb => cb(status));
}
// Debounce handle for auto-syncing local changes
let syncDebounceTimeout: any = null;
let isSyncingInProgress = false;

// Register listeners to watch mutations in habits and entries and sync automatically
export function initializeAutomatedSync() {
  const trigger = () => {
    if (syncDebounceTimeout) clearTimeout(syncDebounceTimeout);
    syncDebounceTimeout = setTimeout(() => {
      syncDataWithSupabase();
    }, 2000); // 2-second debounce to batch saves
  };

  registerHabitSync(trigger);
  registerEntrySync(trigger);

  // Sync on returning online
  window.addEventListener('online', () => {
    console.log('[SyncEngine] Network back online, running sync...');
    syncDataWithSupabase();
  });
}

let realtimeChannel: any = null;

export function subscribeToRealtimeSync() {
  if (realtimeChannel) return;

  const trigger = () => {
    if (syncDebounceTimeout) clearTimeout(syncDebounceTimeout);
    syncDebounceTimeout = setTimeout(() => {
      console.log('[SyncEngine] Realtime event received from server, triggering sync...');
      syncDataWithSupabase();
    }, 1500); // 1.5s debounce for remote events
  };

  realtimeChannel = supabase.channel('habitnook-sync-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' }, () => trigger())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => trigger())
    .subscribe((status) => {
      console.log('[SyncEngine] Realtime subscription status:', status);
    });
}

export function unsubscribeFromRealtimeSync() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// Global modal notifier callback
let conflictAlertCallback: ((message: string) => Promise<void>) | null = null;
export function registerConflictNotifier(callback: (message: string) => Promise<void>) {
  conflictAlertCallback = callback;
}

/**
 * Perform offline-first bidirection sync with Supabase
 */
export async function syncDataWithSupabase(): Promise<{ success: boolean; error?: string }> {
  if (isSyncingInProgress) {
    return { success: false, error: 'Sync already in progress' };
  }

  // Ensure network is active
  if (!navigator.onLine) {
    setSyncStatus('error');
    return { success: false, error: 'Device is offline' };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) {
    return { success: false, error: 'User is not logged in' };
  }

  const userId = session.user.id;
  isSyncingInProgress = true;
  setSyncStatus('syncing');
  console.log('[SyncEngine] Starting offline-first reconciliation...');

  try {
    // ── 1. SYNC DELETIONS FROM LOCAL TO CLOUD ──
    const tombstoned = await db.deletedRecords.toArray();
    
    // Process entries before habits to satisfy foreign key constraints
    const entryTombstones = tombstoned.filter(dr => dr.type === 'entry');
    const habitTombstones = tombstoned.filter(dr => dr.type === 'habit');
    
    for (const dr of entryTombstones) {
      const { error } = await supabase.from('entries').delete().eq('id', dr.id);
      if (error) {
        console.error('[SyncEngine] Cloud deleting entry error:', error);
      } else {
        await db.deletedRecords.delete(dr.id); // Only clear if successful!
      }
    }

    for (const dr of habitTombstones) {
      const { error } = await supabase.from('habits').delete().eq('id', dr.id);
      if (error) {
        console.error('[SyncEngine] Cloud deleting habit error:', error);
      } else {
        await db.deletedRecords.delete(dr.id); // Only clear if successful!
      }
    }
    
    // Cache pending tombstones to prevent zombie resurrection later in this sync run
    const pendingDeletedHabitIds = new Set(habitTombstones.map(dr => dr.id));
    const pendingDeletedEntryIds = new Set(entryTombstones.map(dr => dr.id));

    // ── 2. DOWNLOAD ENTIRE DATA SNAPSHOT FROM CLOUD ──
    const { data: remoteHabitsRaw, error: rhError } = await supabase
      .from('habits')
      .select('*')
      .eq('userId', userId);
    if (rhError) throw rhError;

    const remoteHabits: Habit[] = remoteHabitsRaw || [];
    const remoteHabitIds = new Set(remoteHabits.map(h => h.id));

    // Fetch entries corresponding to those habits
    let remoteEntries: HabitEntry[] = [];
    if (remoteHabits.length > 0) {
      const habitIds = Array.from(remoteHabitIds);
      const { data: remoteEntriesRaw, error: reError } = await supabase
        .from('entries')
        .select('*')
        .in('habitId', habitIds);
      if (reError) throw reError;
      remoteEntries = remoteEntriesRaw || [];
    }

    const remoteEntriesMap = new Map<string, HabitEntry>(remoteEntries.map(e => [e.id, e]));

    // ── 3. FETCH LOCAL COPIES ──
    const localHabits = await db.habits.where('userId').equals(userId).toArray();
    const localHabitsMap = new Map<string, Habit>(localHabits.map(h => [h.id, h]));

    // Fetch entries belonging to local habits
    const localHabitIds = localHabits.map(h => h.id);
    const localEntries = await db.entries.where('habitId').anyOf(localHabitIds.length ? localHabitIds : ['none']).toArray();
    const localEntriesMap = new Map<string, HabitEntry>(localEntries.map(e => [e.id, e]));

    let totalConflictsFixed = 0;

    // ── 4. RECONCILE REMOTE HABITS INTO LOCAL ──
    for (const rh of remoteHabits) {
      if (pendingDeletedHabitIds.has(rh.id)) continue; // Skip zombies
      const lh = localHabitsMap.get(rh.id);

      const remoteHabitWithSyncFlag = { ...rh, _synced: true };

      if (!lh) {
        // New record created on another device, insert locally
        await db.habits.put(remoteHabitWithSyncFlag as Habit);
      } else {
        const lhTime = Date.parse(lh.updatedAt);
        const rhTime = Date.parse(rh.updatedAt);

        if (lhTime === rhTime) {
          // Perfectly matching timestamps - in sync!
          if (!(lh as any)._synced) {
            await db.habits.update(lh.id, { _synced: true });
          }
          continue;
        } else if (lhTime < rhTime) {
          // Cloud copy is newer, overwrite local copy!
          totalConflictsFixed++;
          await db.habits.put(remoteHabitWithSyncFlag as Habit);
        } else {
          // Local copy is newer, push to Supabase
          const { error } = await supabase.from('habits').upsert({
            id: lh.id,
            userId: lh.userId,
            name: lh.name,
            description: lh.description,
            type: lh.type,
            frequency: lh.frequency,
            target: lh.target,
            passPercentage: lh.passPercentage,
            icon: lh.icon,
            color: lh.color,
            weekdays: lh.weekdays,
            createdAt: lh.createdAt,
            updatedAt: lh.updatedAt,
            archived: lh.archived,
          });
          if (!error) {
            await db.habits.update(lh.id, { _synced: true });
          } else {
            console.error('[SyncEngine] Error pushing updated habit:', error);
          }
        }
      }
    }

    // Push local-only habits (not in remote yet, nor deleted) to cloud
    for (const lh of localHabits) {
      if (!remoteHabitIds.has(lh.id)) {
        if ((lh as any)._synced) {
           // It was synced before but is missing from remote - it was deleted remotely!
           await db.habits.delete(lh.id);
        } else {
           // Upload brand new local habit
           const habitUserId = lh.userId === 'local' ? userId : lh.userId;
           const { error } = await supabase.from('habits').insert({
             id: lh.id,
             userId: habitUserId,
             name: lh.name,
             description: lh.description,
             type: lh.type,
             frequency: lh.frequency,
             target: lh.target,
             passPercentage: lh.passPercentage,
             icon: lh.icon,
             color: lh.color,
             weekdays: lh.weekdays,
             createdAt: lh.createdAt,
             updatedAt: lh.updatedAt,
             archived: lh.archived,
           });
           if (!error) {
             await db.habits.update(lh.id, { _synced: true, userId: habitUserId });
           } else {
             console.error('[SyncEngine] Error inserting local habit to cloud:', error);
           }
        }
      }
    }

    // ── 5. RECONCILE REMOTE ENTRIES INTO LOCAL ──
    for (const re of remoteEntries) {
      if (pendingDeletedEntryIds.has(re.id)) continue; // Skip zombies
      const le = localEntriesMap.get(re.id);
      const remoteEntryWithSyncFlag = { ...re, _synced: true };

      if (!le) {
        // Sync new remote entries to IndexedDB
        await db.entries.put(remoteEntryWithSyncFlag as HabitEntry);
      } else {
        const leTime = Date.parse(le.updatedAt);
        const reTime = Date.parse(re.updatedAt);

        if (leTime === reTime) {
          if (!(le as any)._synced) {
            await db.entries.update(le.id, { _synced: true });
          }
          continue;
        } else if (leTime < reTime) {
          // Cloud copy is newer, overwrite local
          totalConflictsFixed++;
          await db.entries.put(remoteEntryWithSyncFlag as HabitEntry);
        } else {
          // Local is newer, upload to Supabase
          const { error } = await supabase.from('entries').upsert({
            id: le.id,
            habitId: le.habitId,
            date: le.date,
            value: le.value,
            remark: le.remark,
            createdAt: le.createdAt,
            updatedAt: le.updatedAt,
          });
          if (!error) {
            await db.entries.update(le.id, { _synced: true });
          } else {
            console.error('[SyncEngine] Error pushing updated entry:', error);
          }
        }
      }
    }

    // Push local-only entries that don't exist on remote yet to cloud
    for (const le of localEntries) {
      if (!remoteEntriesMap.has(le.id)) {
        if ((le as any)._synced) {
          // Deleted remotely! Delete locally
          await db.entries.delete(le.id);
        } else {
          // Check if its parent habit is present in remote before uploading to satisfy foreign key RLS constraints
          if (remoteHabitIds.has(le.habitId) || (localHabitsMap.get(le.habitId) as any)?._synced) {
            const { error } = await supabase.from('entries').insert({
              id: le.id,
              habitId: le.habitId,
              date: le.date,
              value: le.value,
              remark: le.remark,
              createdAt: le.createdAt,
              updatedAt: le.updatedAt,
            });
            if (!error) {
              await db.entries.update(le.id, { _synced: true });
            } else {
              console.error('[SyncEngine] Error inserting local entry to cloud:', error);
            }
          }
        }
      }
    }

    // ── 6. NOTIFY CONFLICT RECONCILIATIONS ──
    if (totalConflictsFixed > 0 && conflictAlertCallback) {
      await conflictAlertCallback(
        `Conflicting changes detected on another device. Your application data has been successfully reverted to match the latest Supabase cloud version.`
      );
    }

    console.log('[SyncEngine] Synchronized successfully. Conflicts overridden:', totalConflictsFixed);
    setSyncStatus('synced');
    return { success: true };
  } catch (err: any) {
    console.error('[SyncEngine] Failed sync operations:', err);
    setSyncStatus('error');
    return { success: false, error: err.message || 'Sync failed' };
  } finally {
    isSyncingInProgress = false;
  }
}
