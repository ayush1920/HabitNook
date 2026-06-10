import { db } from './database';
import type { HabitEntry } from './database';

export async function logEntry(habitId: string, date: string, value: number, remark?: string): Promise<HabitEntry | null> {
  const now = new Date().toISOString();
  // Check if entry already exists for this habit and date
  const existing = await db.entries
    .where('[habitId+date]')
    .equals([habitId, date])
    .first();

  if (value === -2) {
    if (existing) {
      await db.transaction('rw', [db.entries, db.deletedRecords], async () => {
        await db.entries.delete(existing.id);
        await db.deletedRecords.put({ id: existing.id, type: 'entry', deletedAt: now });
      });
      triggerAutomaticSync();
    }
    return null;
  }

  let result: HabitEntry;
  if (existing) {
    result = { ...existing, value, remark, updatedAt: now };
    await db.entries.put(result);
  } else {
    result = {
      id: crypto.randomUUID(),
      habitId,
      date,
      value,
      remark,
      createdAt: now,
      updatedAt: now,
    };
    await db.entries.add(result);
  }
  triggerAutomaticSync();
  return result;
}

export async function getEntriesForHabit(habitId: string): Promise<HabitEntry[]> {
  return await db.entries
    .where('habitId')
    .equals(habitId)
    .sortBy('date');
}

export async function getEntriesInRange(
  habitId: string,
  startDate: string,
  endDate: string
): Promise<HabitEntry[]> {
  return await db.entries
    .where('[habitId+date]')
    .between([habitId, startDate], [habitId, endDate], true, true)
    .sortBy('date');
}

export async function deleteEntry(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.entries, db.deletedRecords], async () => {
    await db.entries.delete(id);
    await db.deletedRecords.put({ id, type: 'entry', deletedAt: now });
  });
  triggerAutomaticSync();
}

// Lazy function definition to avoid circular imports.
let syncTriggerFn: (() => void) | null = null;
export function registerSyncTrigger(fn: () => void) {
  syncTriggerFn = fn;
}

function triggerAutomaticSync() {
  if (syncTriggerFn) {
    syncTriggerFn();
  }
}
