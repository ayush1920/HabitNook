import type { Habit, HabitEntry } from '../db/database';

/**
 * Calculates score for positive habits: Score = min(actual / target, 1.0) * 100
 */
export function scorePositive(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(actual / target, 1.0) * 100;
}

/**
 * Calculates score for limiting habits: Score = max(0, 100 * (1 - actual / (2 * limit)))
 */
export function scoreLimiting(actual: number, limit: number): number {
  if (limit <= 0) {
    return actual === 0 ? 100 : 0;
  }
  if (actual <= limit) {
    return 100;
  }
  // Decay from 100% to 0% between limit and 2 * limit
  return Math.max(0, 100 * (1 - (actual - limit) / limit));
}

/**
 * Unified scorer for a single habit based on type
 */
export function scoreHabit(habit: Habit, actual: number, dateStr?: string): number | null {
  if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0 && dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    if (!habit.weekdays.includes(dayOfWeek)) {
      return null; // Ignore inactive days
    }
  }

  if (actual === -1) return null; // Skipped
  if (actual === -2) {
    return habit.type === 'positive' ? 0 : 100; // Unlogged default scores
  }
  if (habit.type === 'positive') {
    return scorePositive(actual, habit.target);
  } else {
    return scoreLimiting(actual, habit.target); // target acts as limit for limiting habits
  }
}

/**
 * Overall health score: average of all habit scores, skipping null (skipped) entries
 */
export function overallScore(scores: (number | null)[]): number {
  const validScores = scores.filter((s): s is number => s !== null);
  if (validScores.length === 0) return 0;
  const sum = validScores.reduce((acc, s) => acc + s, 0);
  return sum / validScores.length;
}

/**
 * Helper to get color code based on score:
 * - Green (>= 75%): 'success'
 * - Amber (40-75%): 'warning'
 * - Red (< 40%): 'danger'
 */
export function getScoreColorClass(score: number): string {
  if (score >= 75) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
  if (score >= 40) return 'text-amber-400 border-amber-500/30 bg-amber-500/5';
  return 'text-rose-400 border-rose-500/30 bg-rose-500/5';
}

export function getScoreBgColorClass(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

/**
 * Calculates current streak (consecutive target-meeting periods)
 */
export function calculateStreak(habit: Habit, entries: HabitEntry[]): number {
  const entriesMap = new Map<string, number>();
  for (const entry of entries) {
    entriesMap.set(entry.date, entry.value);
  }

  const getLocalDateStr = (d: Date) => {
    const offset = d.getTimezoneOffset();
    const localD = new Date(d.getTime() - offset * 60 * 1000);
    return localD.toISOString().split('T')[0];
  };

  const getMondayOf = (d: Date) => {
    const result = new Date(d);
    const day = result.getDay();
    // Monday is 1, Sunday is 0. If day is 0 (Sunday), we subtract 6, else we subtract (day - 1).
    const diff = result.getDate() - (day === 0 ? 6 : day - 1);
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const today = new Date();

  if (habit.frequency === 'daily') {
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = getLocalDateStr(checkDate);
      
      if (habit.weekdays && habit.weekdays.length > 0 && !habit.weekdays.includes(checkDate.getDay())) {
        continue; // Skip inactive days without breaking streak
      }

      const val = entriesMap.get(dateStr);
      const isToday = i === 0;

      // Pass values threshold configuration (passPercentage)
      // E.g. habit.passPercentage = 50, habit.target = 10, targetNeeded = 5
      const passRatio = habit.passPercentage !== undefined ? habit.passPercentage / 100 : 1.0;
      const targetNeededForStreak = Math.ceil(habit.target * passRatio);

      if (isToday) {
        if (val === undefined || val === -1) {
          // Today is unlogged or skipped: preserve streak, don't increment, don't break.
          continue;
        }
        if (habit.type === 'positive') {
          if (val >= targetNeededForStreak) {
            streak++;
          } else if (habit.target === 1 && val === 0) {
            // Explicitly logged 0 (cross) on daily target=1 breaks streak
            break;
          }
          // Otherwise, today is in progress, don't break but don't increment.
        } else {
          // Limiting habit
          if (val <= habit.target) {
            streak++;
          } else {
            // Over limit breaks streak immediately
            break;
          }
        }
      } else {
        // Past day
        if (val === -1) {
          // Skip preserves streak without incrementing
          continue;
        }
        if (val === undefined) {
          // Unlogged breaks streak
          break;
        }
        if (habit.type === 'positive') {
          if (val >= targetNeededForStreak) {
            streak++;
          } else {
            break; // Failed to meet target Needed
          }
        } else {
          if (val <= habit.target) {
            streak++;
          } else {
            break; // Exceeded limit
          }
        }
      }
    }
    return streak;
  }

  if (habit.frequency === 'weekly') {
    let streak = 0;
    const currentMonday = getMondayOf(today);
    
    for (let i = 0; i < 52; i++) {
      const weekMonday = new Date(currentMonday);
      weekMonday.setDate(currentMonday.getDate() - i * 7);
      
      const weekSunday = new Date(weekMonday);
      weekSunday.setDate(weekMonday.getDate() + 6);
      
      const mStr = getLocalDateStr(weekMonday);
      const sStr = getLocalDateStr(weekSunday);

      const weekEntries = entries.filter(e => e.date >= mStr && e.date <= sStr);
      const isCurrentWeek = i === 0;

      const hasSkip = weekEntries.some(e => e.value === -1);
      if (hasSkip) {
        // Skip preserves streak
        continue;
      }

      if (weekEntries.length === 0) {
        if (isCurrentWeek) {
          continue;
        } else {
          break;
        }
      }

      const sum = weekEntries.reduce((acc, e) => e.value >= 0 ? acc + e.value : acc, 0);
      const passRatio = habit.passPercentage !== undefined ? habit.passPercentage / 100 : 1.0;
      const targetNeededForStreak = Math.ceil(habit.target * passRatio);

      if (habit.type === 'positive') {
        if (sum >= targetNeededForStreak) {
          streak++;
        } else {
          if (isCurrentWeek) {
            continue;
          } else {
            break;
          }
        }
      } else {
        if (sum <= habit.target) {
          streak++;
        } else {
          break;
        }
      }
    }
    return streak;
  }

  if (habit.frequency === 'monthly') {
    let streak = 0;
    for (let i = 0; i < 12; i++) {
      const year = today.getFullYear();
      const month = today.getMonth() - i;
      
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      
      const mStr = getLocalDateStr(monthStart);
      const sStr = getLocalDateStr(monthEnd);

      const monthEntries = entries.filter(e => e.date >= mStr && e.date <= sStr);
      const isCurrentMonth = i === 0;

      const hasSkip = monthEntries.some(e => e.value === -1);
      if (hasSkip) {
        continue;
      }

      if (monthEntries.length === 0) {
        if (isCurrentMonth) {
          continue;
        } else {
          break;
        }
      }

      const sum = monthEntries.reduce((acc, e) => e.value >= 0 ? acc + e.value : acc, 0);
      const passRatio = habit.passPercentage !== undefined ? habit.passPercentage / 100 : 1.0;
      const targetNeededForStreak = Math.ceil(habit.target * passRatio);

      if (habit.type === 'positive') {
        if (sum >= targetNeededForStreak) {
          streak++;
        } else {
          if (isCurrentMonth) {
            continue;
          } else {
            break;
          }
        }
      } else {
        if (sum <= habit.target) {
          streak++;
        } else {
          break;
        }
      }
    }
    return streak;
  }

  return 0;
}

