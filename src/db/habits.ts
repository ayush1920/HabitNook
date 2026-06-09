import { db } from './database';
import type { Habit } from './database';

export async function addHabit(
  habit: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'archived'> & {
    id?: string;
    description?: string;
    passPercentage?: number;
    createdAt?: string;
    updatedAt?: string;
    archived?: boolean;
  }
): Promise<Habit> {
  const now = new Date().toISOString();
  const newHabit: Habit = {
    id: habit.id || crypto.randomUUID(),
    createdAt: habit.createdAt || now,
    updatedAt: habit.updatedAt || now,
    archived: habit.archived ?? false,
    ...habit,
  } as Habit;
  await db.habits.add(newHabit);
  // Trigger async sync if online and logged in
  triggerAutomaticSync();
  return newHabit;
}

export async function updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt'>>): Promise<void> {
  const now = new Date().toISOString();
  await db.habits.update(id, { ...updates, updatedAt: now });
  // Trigger async sync if online and logged in
  triggerAutomaticSync();
}

export async function deleteHabit(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.habits, db.entries, db.deletedRecords], async () => {
    // Track deletion for all associated entries first
    const entries = await db.entries.where('habitId').equals(id).toArray();
    for (const entry of entries) {
      await db.deletedRecords.put({ id: entry.id, type: 'entry', deletedAt: now });
    }
    await db.entries.where('habitId').equals(id).delete();
    
    // Then track deletion for the habit
    await db.deletedRecords.put({ id, type: 'habit', deletedAt: now });
    await db.habits.delete(id);
  });
  // Trigger async sync if online and logged in
  triggerAutomaticSync();
}

export async function getHabits(userId: string, includeArchived = false): Promise<Habit[]> {
  const habits = await db.habits.where('userId').equals(userId).toArray();
  if (includeArchived) {
    return habits;
  }
  return habits.filter((h) => !h.archived);
}

export async function archiveHabit(id: string, archived = true): Promise<void> {
  const now = new Date().toISOString();
  await db.habits.update(id, { archived, updatedAt: now });
  triggerAutomaticSync();
}

// Lazy function definition to avoid circular imports.
// This will be implemented in the sync module and registered on load.
let syncTriggerFn: (() => void) | null = null;
export function registerSyncTrigger(fn: () => void) {
  syncTriggerFn = fn;
}

function triggerAutomaticSync() {
  if (syncTriggerFn) {
    syncTriggerFn();
  }
}
