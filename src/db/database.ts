import Dexie, { type Table } from 'dexie';

export interface Habit {
  id: string;          // UUID
  userId: string;      // supabase user id (or 'local' for offline)
  name: string;
  description?: string; // description of the habit
  type: 'positive' | 'limiting';
  frequency: 'daily' | 'weekly' | 'monthly';
  target: number;      // positive: min goal, limiting: max allowed
  passPercentage?: number; // pass value (e.g. 50% score required to keep streak)
  icon?: string;       // emoji or Lucide icon name
  color?: string;      // hex color for UI/charts
  weekdays?: number[]; // active days of the week (0=Sun, 1=Mon, ...)
  createdAt: string;   // ISO date string
  updatedAt: string;   // ISO date string for sync tracking
  archived: boolean;
}

export interface HabitEntry {
  id: string;          // UUID
  habitId: string;     // foreign key to Habit
  date: string;        // YYYY-MM-DD
  value: number;       // count or value logged
  remark?: string;     // custom markdown/text remark for the day
  createdAt: string;   // ISO date string
  updatedAt: string;   // ISO date string for sync tracking
}

export interface DeletedRecord {
  id: string;          // UUID of habit or entry
  type: 'habit' | 'entry';
  deletedAt: string;   // ISO date string
}

export class HabitLoopDatabase extends Dexie {
  habits!: Table<Habit>;
  entries!: Table<HabitEntry>;
  deletedRecords!: Table<DeletedRecord>;

  constructor() {
    super('HabitLoopDatabase');
    this.version(3).stores({
      habits: 'id, userId, archived, updatedAt',
      entries: 'id, habitId, date, [habitId+date], updatedAt',
      deletedRecords: 'id, type, deletedAt'
    });
  }
}

export const db = new HabitLoopDatabase();
