import type { HabitEntry, Habit } from '../db/database';
import { scoreHabit } from './engine';

export interface WeekdayScore {
  dayName: string;
  averageScore: number;
  count: number;
}

export interface DistributionBucket {
  range: string;
  count: number;
}

export interface TimelinePeriod {
  dateStr: string; // Period start date YYYY-MM-DD
  label: string;   // UI label (e.g. "Jun 08", "Wk of Jun 01", "Jun '26")
  actual: number;  // total logged value in this period (-1 = skipped, -2 = unlogged)
  score: number | null; // score based on actual vs target, null if skipped
}

/**
 * Computes moving average for an array of scores which may contain nulls (skipped days).
 * For index i, averages non-null values from max(0, i - window + 1) to i.
 * Carries forward the previous valid moving average if no valid scores exist in the window.
 */
export function movingAverage(data: (number | null)[], window: number): number[] {
  if (data.length === 0) return [];
  const ma: number[] = [];
  let lastValidMa = 0;

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const subset = data.slice(start, i + 1).filter((v): v is number => v !== null);
    
    if (subset.length > 0) {
      const sum = subset.reduce((acc, val) => acc + val, 0);
      lastValidMa = sum / subset.length;
    }
    ma.push(lastValidMa);
  }
  return ma;
}

/**
 * Determines trend direction based on the last few moving average values.
 * Compares the latest value with a value from a few steps back (default 5, or less if shorter).
 */
export function trendDirection(ma: number[], lookback = 5): 'improving' | 'declining' | 'stable' {
  if (ma.length < 2) return 'stable';
  const latest = ma[ma.length - 1];
  const compareIndex = Math.max(0, ma.length - 1 - lookback);
  const pastValue = ma[compareIndex];
  const diff = latest - pastValue;

  if (diff > 2) return 'improving';
  if (diff < -2) return 'declining';
  return 'stable';
}

/**
 * Analyzes average score per weekday for daily habits, skipping null scores.
 * Returns scores mapped to Mon-Sun.
 */
export function weekdayPattern(entries: HabitEntry[], habit: Habit): WeekdayScore[] {
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Initialize sums
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);

  // Group entries by weekday
  for (const entry of entries) {
    const [year, month, day] = entry.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const wday = date.getDay(); // 0-6

    const score = scoreHabit(habit, entry.value, entry.date);
    if (score !== null) {
      sums[wday] += score;
      counts[wday] += 1;
    }
  }

  // Map to Monday-Sunday order for standard charting (Mon to Sun)
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon=1, ..., Sat=6, Sun=0
  return order.map((dayIdx) => {
    const count = counts[dayIdx];
    return {
      dayName: dayNamesShort[dayIdx],
      averageScore: count > 0 ? Math.round(sums[dayIdx] / count) : 0,
      count,
    };
  });
}

/**
 * Groups scores into 5 buckets for a distribution histogram, ignoring null (skipped) scores.
 */
export function distribution(scores: (number | null)[]): DistributionBucket[] {
  const buckets: DistributionBucket[] = [
    { range: '0-20%', count: 0 },
    { range: '21-40%', count: 0 },
    { range: '41-60%', count: 0 },
    { range: '61-80%', count: 0 },
    { range: '81-100%', count: 0 },
  ];

  for (const score of scores) {
    if (score === null) continue;
    if (score <= 20) buckets[0].count++;
    else if (score <= 40) buckets[1].count++;
    else if (score <= 60) buckets[2].count++;
    else if (score <= 80) buckets[3].count++;
    else buckets[4].count++;
  }

  return buckets;
}

/**
 * Groups raw daily logs into daily, weekly, or monthly periods and computes their scores.
 */
export function getTimeline(
  habit: Habit,
  entries: HabitEntry[],
  startDate: Date,
  endDate: Date
): TimelinePeriod[] {
  const entryMap = new Map<string, number>();
  for (const entry of entries) {
    entryMap.set(entry.date, entry.value);
  }

  const periods: TimelinePeriod[] = [];
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  if (habit.frequency === 'daily') {
    const current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const actual = entryMap.has(dateStr) ? entryMap.get(dateStr)! : -2; // -2 represents unlogged
      const score = scoreHabit(habit, actual, dateStr);
      const label = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      periods.push({
        dateStr,
        label,
        actual,
        score
      });

      current.setDate(current.getDate() + 1);
    }
  } else if (habit.frequency === 'weekly') {
    const current = new Date(start);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff); // Monday of starting week

    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const dayVal = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayVal}`;

      let actual = 0;
      let hasWeeklyEntry = false;
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const checkDay = new Date(current);
      while (checkDay <= weekEnd) {
        const cYear = checkDay.getFullYear();
        const cMonth = String(checkDay.getMonth() + 1).padStart(2, '0');
        const cDay = String(checkDay.getDate()).padStart(2, '0');
        const checkDateStr = `${cYear}-${cMonth}-${cDay}`;
        
        if (entryMap.has(checkDateStr)) {
          hasWeeklyEntry = true;
          const val = entryMap.get(checkDateStr)!;
          if (val >= 0) actual += val; // skip negative/skipped values in sum
        }
        checkDay.setDate(checkDay.getDate() + 1);
      }

      // If no entries at all in the week, it counts as unlogged
      const finalActual = hasWeeklyEntry ? actual : -2;
      const score = scoreHabit(habit, finalActual);
      const label = `Wk of ${current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

      periods.push({
        dateStr,
        label,
        actual: finalActual,
        score
      });

      current.setDate(current.getDate() + 7);
    }
  } else if (habit.frequency === 'monthly') {
    const current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const year = current.getFullYear();
      const monthStr = String(current.getMonth() + 1).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-01`;

      let actual = 0;
      let hasMonthlyEntry = false;
      const nextMonth = new Date(year, current.getMonth() + 1, 1);
      
      const checkDay = new Date(current);
      while (checkDay < nextMonth) {
        const cYear = checkDay.getFullYear();
        const cMonth = String(checkDay.getMonth() + 1).padStart(2, '0');
        const cDay = String(checkDay.getDate()).padStart(2, '0');
        const checkDateStr = `${cYear}-${cMonth}-${cDay}`;
        
        if (entryMap.has(checkDateStr)) {
          hasMonthlyEntry = true;
          const val = entryMap.get(checkDateStr)!;
          if (val >= 0) actual += val;
        }
        checkDay.setDate(checkDay.getDate() + 1);
      }

      const finalActual = hasMonthlyEntry ? actual : -2;
      const score = scoreHabit(habit, finalActual);
      const label = current.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

      periods.push({
        dateStr,
        label,
        actual: finalActual,
        score
      });

      current.setMonth(current.getMonth() + 1);
    }
  }

  return periods;
}
