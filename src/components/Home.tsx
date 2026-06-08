import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { Plus, TrendingUp, Activity } from 'lucide-react';
import type { Habit } from '../db/database';
import { getHabits } from '../db/habits';
import { db } from '../db/database';
import { getEntriesForHabit } from '../db/entries';
import { scoreHabit, overallScore, getScoreColorClass, calculateStreak } from '../scoring/engine';


export interface HomeProps {
  user: User;
  onSelectHabit: (habit: Habit) => void;
  onAddHabitClick: () => void;
  onLogHabitClick?: (habit: Habit, dateStr?: string) => void;
  refreshTrigger?: number;
}

interface HabitWithStats extends Habit {
  currentValue: number;
  currentScore: number | null;
  weekValues: { [dateStr: string]: number | undefined };
  currentStreak: number;
}

export default function Home({
  user,
  onSelectHabit,
  onAddHabitClick,
  onLogHabitClick,
  refreshTrigger
}: HomeProps) {
  const [habits, setHabits] = useState<HabitWithStats[]>([]);
  const [healthScore, setHealthScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | '1w' | '1m' | '3m'>('today');

  // Swipe to pull down refresh state attributes
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isManualSyncActive, setIsManualSyncActive] = useState(false);
  const [syncToastMessage, setSyncConflictToastMessage] = useState<{ text: string; error: boolean } | null>(null);

  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Swipe to refresh only from scroll boundaries at the top of viewport pages
    const mainEl = document.querySelector('main');
    if (!mainEl || mainEl.scrollTop > 5) return;
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = startYRef.current;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const mainEl = document.querySelector('main');
    if (!mainEl || mainEl.scrollTop > 5 || startYRef.current === 0) return;
    
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;

    if (diff > 0) {
      if (e.cancelable) e.preventDefault();
      setIsPulling(true);
      const progress = Math.min(diff / 160, 1.0); // 160px maximum activation boundary pull
      setPullProgress(progress);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    
    const wasPulledEnough = pullProgress >= 0.85;
    setIsPulling(false);
    setPullProgress(0);
    startYRef.current = 0;

    if (wasPulledEnough) {
      setIsManualSyncActive(true);
      // Trigger Supabase Dynamic sync
      const { syncDataWithSupabase } = await import('../db/sync');
      const res = await syncDataWithSupabase();
      if (res.success) {
        setSyncConflictToastMessage({ text: 'Sync Completed Successfully ✔', error: false });
      } else {
        setSyncConflictToastMessage({ text: `Sync Failed: ${res.error}`, error: true });
      }
      setIsManualSyncActive(false);
      loadData();
      setTimeout(() => setSyncConflictToastMessage(null), 3500);
    }
  };

  const handleSyncButtonManual = async () => {
    setIsManualSyncActive(true);
    const { syncDataWithSupabase } = await import('../db/sync');
    const res = await syncDataWithSupabase();
    if (res.success) {
      setSyncConflictToastMessage({ text: 'Sync Completed Successfully ✔', error: false });
    } else {
      setSyncConflictToastMessage({ text: `Sync Failed: ${res.error}`, error: true });
    }
    setIsManualSyncActive(false);
    loadData();
    setTimeout(() => setSyncConflictToastMessage(null), 3500);
  };

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Format local YYYY-MM-DD
  const getLocalDateStr = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - offset * 60 * 1000);
    return localToday.toISOString().split('T')[0];
  };

  // Generate the 7 days of the current week (Monday to Sunday) timezone-safely
  const getWeekDays = () => {
    const today = new Date();
    const day = today.getDay();
    // Monday is 1, Sunday is 0. If day is 0 (Sunday), we subtract 6, else we subtract (day - 1).
    const diff = today.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const days = [];
    const nowOffset = new Date().getTimezoneOffset();
    const localNow = new Date(Date.now() - nowOffset * 60 * 1000);
    const todayStr = localNow.toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const offset = d.getTimezoneOffset();
      const localD = new Date(d.getTime() - offset * 60 * 1000);
      const dateStr = localD.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString(undefined, { weekday: 'narrow' }); // M, T, W...
      const dayNameShort = d.toLocaleDateString(undefined, { weekday: 'short' });

      const isToday = dateStr === todayStr;
      const isFuture = dateStr > todayStr;

      days.push({
        dateStr,
        dayLabel,
        dayNameShort,
        dayOfMonth: d.getDate(),
        isToday,
        isFuture,
      });
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Load habits and calculate statistics
  const loadData = async () => {
    setLoading(true);
    try {
      const activeHabits = await getHabits(user.id === 'local' ? 'local' : user.id, false);
      
      const COLOR_MIGRATION_MAP: Record<string, string> = {
        '#a78bfa': 'var(--habit-color-1)',
        '#10b981': 'var(--habit-color-2)',
        '#f43f5e': 'var(--habit-color-3)',
        '#f59e0b': 'var(--habit-color-4)',
        '#f97316': 'var(--habit-color-5)',
        '#06b6d4': 'var(--habit-color-6)',
        '#ec4899': 'var(--habit-color-7)',
        '#14b8a6': 'var(--habit-color-8)',
      };

      for (const h of activeHabits) {
        if (h.color && COLOR_MIGRATION_MAP[h.color]) {
          h.color = COLOR_MIGRATION_MAP[h.color];
          await db.habits.update(h.id, { color: h.color });
        }
      }

      const todayStr = getLocalDateStr();
      const today = new Date();

      const firstDayStr = weekDays[0].dateStr;
      const lastDayStr = weekDays[6].dateStr;

      // Fetch all week entries for user's active habits
      const weekEntries = await db.entries
        .where('date')
        .between(firstDayStr, lastDayStr, true, true)
        .toArray();

      const activeHabitIds = new Set(activeHabits.map((h) => h.id));
      const filteredWeekEntries = weekEntries.filter((e) => activeHabitIds.has(e.habitId));

      const weekEntryMap = new Map<string, number>();
      for (const entry of filteredWeekEntries) {
        weekEntryMap.set(`${entry.habitId}_${entry.date}`, entry.value);
      }

      const enrichedHabits: HabitWithStats[] = await Promise.all(
        activeHabits.map(async (habit) => {
          let currentValue = 0;

          if (habit.frequency === 'daily') {
            const entry = await db.entries
              .where('[habitId+date]')
              .equals([habit.id, todayStr])
              .first();
            currentValue = entry ? entry.value : 0;
          } else if (habit.frequency === 'weekly') {
            // Find current week range (Monday to Sunday)
            const current = new Date(today);
            const day = current.getDay();
            const diff = current.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(current.setDate(diff));
            monday.setHours(0, 0, 0, 0);

            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            sunday.setHours(23, 59, 59, 999);

            const mStr = monday.toISOString().split('T')[0];
            const sStr = sunday.toISOString().split('T')[0];

            // Fetch and sum weekly entries
            const entries = await db.entries
              .where('[habitId+date]')
              .between([habit.id, mStr], [habit.id, sStr], true, true)
              .toArray();
            currentValue = entries.reduce((sum, e) => sum + e.value, 0);
          } else if (habit.frequency === 'monthly') {
            // Find current month range
            const y = today.getFullYear();
            const m = today.getMonth();
            const startOfMonth = new Date(y, m, 1);
            const endOfMonth = new Date(y, m + 1, 0);

            const startStr = startOfMonth.toISOString().split('T')[0];
            const endStr = endOfMonth.toISOString().split('T')[0];

            // Fetch and sum monthly entries
            const entries = await db.entries
              .where('[habitId+date]')
              .between([habit.id, startStr], [habit.id, endStr], true, true)
              .toArray();
            currentValue = entries.reduce((sum, e) => sum + e.value, 0);
          }

          const currentScore = scoreHabit(habit, currentValue, habit.frequency === 'daily' ? todayStr : undefined);

          // Get 7 days week values
          const weekValues: { [dateStr: string]: number | undefined } = {};
          weekDays.forEach((wd) => {
            weekValues[wd.dateStr] = weekEntryMap.get(`${habit.id}_${wd.dateStr}`);
          });

          const entries = await getEntriesForHabit(habit.id);
          const currentStreak = calculateStreak(habit, entries);

          return {
            ...habit,
            currentValue,
            currentScore,
            weekValues,
            currentStreak,
          };
        })
      );

      // Sorting handler: Move filled/completed habits of today to the end of the lists!
      // A habit is filled for today if its currentValue is logged (value > 0 or explicit fail/unset state has been processed)
      // For target-1 daily, filled means val === 1 or 0 explicitly logged. For others, any positive input currentValue configures it.
      // This allows unfilled cards to rise on top of the list stack naturally!
      const sortedHabits = enrichedHabits.sort((a, b) => {
        const isAFilled = a.currentValue > 0 || (a.frequency === 'daily' && a.target === 1 && a.weekValues[todayStr] !== undefined);
        const isBFilled = b.currentValue > 0 || (b.frequency === 'daily' && b.target === 1 && b.weekValues[todayStr] !== undefined);
        if (isAFilled && !isBFilled) return 1;
        if (!isAFilled && isBFilled) return -1;
        return 0;
      });

      setHabits(sortedHabits);

      // Dynamically calculate Health Score based on Selected timeRange
      if (timeRange === 'today') {
        const scores = sortedHabits.map((h) => h.currentScore);
        setHealthScore(Math.round(overallScore(scores)));
      } else {
        // Calculate ranges for 1w (7d), 1m (30d), 3m (90d)
        let daysToLookBack = 7;
        if (timeRange === '1m') daysToLookBack = 30;
        if (timeRange === '3m') daysToLookBack = 90;

        const lookbackStart = new Date();
        lookbackStart.setDate(lookbackStart.getDate() - daysToLookBack);
        lookbackStart.setHours(0, 0, 0, 0);

        const lookbackStartStr = lookbackStart.toISOString().split('T')[0];
        const lookbackEndStr = new Date().toISOString().split('T')[0];

        // Fetch all entries in lock bounds for overall score
        const rangeScores: (number | null)[] = [];

        for (const h of sortedHabits) {
          const rawEntries = await db.entries
            .where('[habitId+date]')
            .between([h.id, lookbackStartStr], [h.id, lookbackEndStr], true, true)
            .toArray();

          const entryDaysMap = new Map(rawEntries.map(re => [re.date, re.value]));
          const currentWalk = new Date(lookbackStart);
          const periodScores = [];

          while (currentWalk <= new Date()) {
            const dateKey = currentWalk.toISOString().split('T')[0];
            const val = entryDaysMap.get(dateKey) ?? 0;
            const singleScore = scoreHabit(h, val, h.frequency === 'daily' ? dateKey : undefined);
            if (singleScore !== null) {
              periodScores.push(singleScore);
            }
            currentWalk.setDate(currentWalk.getDate() + 1);
          }

          if (periodScores.length > 0) {
            rangeScores.push(periodScores.reduce((sum, s) => sum + s, 0) / periodScores.length);
          } else {
            rangeScores.push(h.currentScore);
          }
        }

        setHealthScore(Math.round(overallScore(rangeScores)));
      }

    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id, refreshTrigger, timeRange]);

  // Load habits and calculate statistics

  // Open LogEntrySheet for other habits
  const handleDayClick = (e: React.MouseEvent, habit: HabitWithStats, dateStr: string) => {
    e.stopPropagation();

    // Check if weekday is active
    if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      if (!habit.weekdays.includes(dayOfWeek)) {
        return; // do nothing
      }
    }

    if (onLogHabitClick) {
      onLogHabitClick(habit, dateStr);
    }
  };

  // SVGRing Calculations
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6 pb-24 relative"
    >
      {/* Swipe to Pull Down Sync Indicator */}
      {isPulling && (
        <div 
          className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-accent transition-all animate-fade-in"
          style={{ transform: `translateY(${pullProgress * 15}px)`, opacity: pullProgress }}
        >
          <div className={`w-4 h-4 border-2 border-accent border-t-transparent rounded-full ${pullProgress >= 0.85 ? 'animate-spin' : ''}`} />
          <span>{pullProgress >= 0.85 ? 'Release to Sync with Cloud...' : 'Pull to Sync Content'}</span>
        </div>
      )}

      {/* Manual Syncing Loading Overlay */}
      {isManualSyncActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/70 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-text-secondary font-bold font-mono tracking-wider animate-pulse">Syncing with Supabase...</p>
          </div>
        </div>
      )}

      {/* ── Welcome Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-1 to-surface-2 border border-border p-8 mb-2">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight leading-tight">
              {greeting}, <span className="bg-linear-to-r from-accent to-success bg-clip-text text-transparent">{displayName}</span>
            </h2>
            <p className="text-sm sm:text-base text-text-secondary max-w-lg">
              Let's stay consistent and loop in those positive habits today. Keep up the momentum!
            </p>
          </div>
          {user.id !== 'local' && (
            <button
               onClick={handleSyncButtonManual}
               title="Force Sync with Cloud"
               className="self-end md:self-auto text-xs uppercase font-extrabold text-accent border border-border bg-surface-1 py-2.5 px-4 rounded-xl hover:bg-surface-2 active:scale-95 transition-all text-center flex items-center gap-2 cursor-pointer shadow-xs whitespace-nowrap"
            >
               <span>Sync</span>
               <span>↻</span>
            </button>
          )}
        </div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : habits.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-accent-dim border border-accent/20 mb-4">
            <Activity className="w-5 h-5 text-accent animate-pulse" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">No habits tracking yet</h3>
          <p className="text-xs text-text-secondary max-w-xs mt-1.5 mb-6 leading-relaxed">
            Create your first positive or limiting habit to begin monitoring your scores and trends.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onAddHabitClick}
              className="px-4 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-accent border border-accent hover:bg-accent/90 hover:border-accent/90 hover:shadow-lg hover:shadow-accent/20 rounded-xl active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create First Habit
            </button>
          </div>
        </div>
      ) : (
        /* ── Dashboard Grid ── */
        <>
          {/* Health Score Overview Panel */}
          <div className="grid grid-cols-1 md:grid-cols-10 gap-4">

            {/* Circular Ring Score Card (60% width) */}
            <div className="bg-surface-1 border border-border rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5 md:col-span-6 shadow-sm min-w-0">
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-20 h-20 transform -rotate-90">
                  <defs>
                    <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--accent)" />
                      <stop offset="100%" stopColor="var(--success)" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="var(--border)"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="url(#healthGrad)"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-extrabold font-mono text-text-primary">{healthScore}%</span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-text-primary flex items-center gap-1.5 whitespace-nowrap">
                    <TrendingUp className="w-5 h-5 text-accent" />
                    Overall Health Score
                  </h3>
                  
                  {/* Symmetrical Time Range Select Segment */}
                  <div className="flex bg-surface-3 p-0.5 rounded-lg border border-border/80 text-xs sm:text-sm self-start w-fit">
                    {[
                      { key: 'today', label: 'Today' },
                      { key: '1w', label: '1W' },
                      { key: '1m', label: '1M' },
                      { key: '3m', label: '3M' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimeRange(item.key as any);
                        }}
                        className={`px-4 py-2 font-bold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                          timeRange === item.key 
                            ? 'bg-surface-1 text-accent shadow-xs border border-border/20' 
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed max-w-md">
                  Completion health aggregate across your active targets. Viewing {timeRange === 'today' ? 'today\'s current active logs' : `your moving average history for the past ${timeRange === '1w' ? '7' : timeRange === '1m' ? '30' : '90'} days`}.
                </p>
              </div>
            </div>

            {/* Dashboard Status Card (40% width) */}
            <div className="bg-surface-1 border border-border rounded-2xl p-5 flex flex-col justify-between md:col-span-4 shadow-sm">
              <div>
                <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Dashboard Status</span>

                <div className="space-y-2 mt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Tracking Today</span>
                    <span className="font-bold text-text-primary font-mono">{habits.length} habits</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Active Streaks</span>
                    <span className="font-bold text-amber-500 font-mono">🔥 {habits.filter(h => h.currentStreak > 0).length} habits</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Completed Today</span>
                    <span className="font-bold text-emerald-500 font-mono">✔ {
                      habits.filter(h => h.currentValue > 0 || (h.frequency === 'daily' && h.target === 1 && h.weekValues[getLocalDateStr()] === 1)).length
                    } / {habits.length}</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-text-tertiary font-bold tracking-widest text-right mt-2 uppercase">
                Production Safe Mode
              </div>
            </div>

          </div>

          {/* ── Habits Grid Section ── */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Your Habits
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {habits.map((habit) => {
                const isPositive = habit.type === 'positive';
                const isLimitExceeded = !isPositive && habit.currentValue > habit.target;
                const isGoalMet = isPositive && habit.currentValue >= habit.target;

                const scoreColorClass = habit.currentScore !== null
                  ? getScoreColorClass(habit.currentScore)
                  : 'text-text-secondary border-border bg-surface-2';
                const progressPercent = Math.min(100, (habit.currentValue / habit.target) * 100);

                return (
                  <div
                    key={habit.id}
                    onClick={() => onSelectHabit(habit)}
                    className="group relative bg-surface-1/65 backdrop-blur-md border border-border hover:border-accent/30 rounded-2xl p-6 flex flex-col justify-between gap-5 transition-all duration-300 cursor-pointer overflow-hidden hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
                    style={{ '--habit-color': habit.color || 'var(--accent)' } as React.CSSProperties}
                  >
                    {/* Hover Glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500 pointer-events-none"
                      style={{ background: 'radial-gradient(circle at top right, var(--habit-color) 0%, transparent 60%)' }}
                    />

                    {/* Header */}
                    <div className="relative z-10 flex justify-between items-start gap-3">
                      <div className="flex gap-3 min-w-0 items-center">
                        <span className="text-3xl shrink-0">{habit.icon || '💪'}</span>
                        <div className="min-w-0">
                          <h4 className="text-base sm:text-lg font-bold text-text-primary truncate leading-tight group-hover:text-accent transition-colors">
                            {habit.name}
                          </h4>
                          {habit.description && (
                            <p className="text-[11px] text-text-tertiary truncate leading-tight mt-1 max-w-xs">{habit.description}</p>
                          )}
                          <span className="text-[10px] text-text-tertiary capitalize mt-1.5 block leading-none">
                            {habit.frequency} • {isPositive ? 'Goal' : 'Limit'}: {habit.target}
                            {habit.passPercentage && habit.passPercentage < 100 && (
                              <span className="text-amber-500 font-bold ml-1.5 font-mono">({habit.passPercentage}% Pass)</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Score & Streak Badges */}
                      <div className="flex items-center gap-2 shrink-0">
                        {habit.currentStreak > 0 && (
                          <div className="px-2.5 py-1 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1" title={`Active streak: ${habit.currentStreak} ${habit.frequency === 'daily' ? 'days' : habit.frequency === 'weekly' ? 'weeks' : 'months'}`}>
                            <span>🔥</span>
                            <span>{habit.currentStreak}</span>
                          </div>
                        )}
                        <div className={`px-2.5 py-1 rounded text-xs font-bold font-mono border ${scoreColorClass}`}>
                          {habit.currentScore !== null ? `${Math.round(habit.currentScore)}%` : 'Skipped'}
                        </div>
                      </div>
                    </div>

                    {/* Progress details (only for non status-loggers or multi-goal habits) */}
                    {!(habit.frequency === 'daily' && habit.target === 1) && (
                      <div className="relative z-10 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-text-secondary">
                            {isPositive ? 'Logged:' : 'Actual:'} <strong className="text-text-primary font-mono">{habit.currentValue}</strong> / {habit.target}
                          </span>
                          <span className="text-text-tertiary">
                            {isPositive
                              ? isGoalMet ? 'Goal Met! 🎉' : `${habit.target - habit.currentValue} left`
                              : isLimitExceeded ? 'Exceeded ⚠️' : 'Safe ✅'
                            }
                          </span>
                        </div>

                        {/* Simple custom progress bar */}
                        <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${isPositive
                              ? isGoalMet ? 'bg-emerald-500' : 'bg-accent'
                              : isLimitExceeded ? 'bg-rose-500' : 'bg-emerald-500'
                              }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Current Week Inline Logging / Manipulation */}
                    <div 
                      className="relative z-10 border-t border-border/40 pt-4 mt-1"
                    >
                      <div className="flex justify-between items-center mb-5">
                        <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">
                          Current Week Progress
                        </span>
                      </div>

                      <div
                        className="flex justify-between items-center gap-1"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {weekDays.map((wd) => {
                          const val = habit.weekValues[wd.dateStr];
                          const isTarget1Daily = habit.frequency === 'daily' && habit.target === 1;

                          let isActiveDay = true;
                          if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0) {
                            const [y, m, d] = wd.dateStr.split('-').map(Number);
                            const dayOfWeek = new Date(y, m - 1, d).getDay();
                            isActiveDay = habit.weekdays.includes(dayOfWeek);
                          }

                          let circleContent = '?';
                          let circleStyle = 'border-border text-text-secondary bg-surface-2';

                          if (!isActiveDay) {
                            circleContent = '-';
                            circleStyle = 'border-border border-dashed bg-surface-1 text-text-tertiary opacity-40 cursor-not-allowed';
                          } else if (isTarget1Daily) {
                            if (val === 1) {
                              circleContent = '✔';
                              circleStyle = 'border-success bg-success/20 text-success font-extrabold shadow-[0_0_8px_rgba(74,222,128,0.2)]';
                            } else if (val === 0) {
                              circleContent = '✘';
                              circleStyle = 'border-danger bg-danger/20 text-danger font-extrabold shadow-[0_0_8px_rgba(248,113,113,0.2)]';
                            } else if (val === -1) {
                              circleContent = '-';
                              circleStyle = 'border-white/20 bg-surface-3 text-text-primary font-extrabold';
                            } else if (val === undefined) {
                              circleContent = '?';
                              circleStyle = 'border-white/20 bg-surface-2 text-text-secondary';
                            } else {
                              // Any other logged value on a target-1 habit counts as cross/failed
                              circleContent = '✘';
                              circleStyle = 'border-danger bg-danger/20 text-danger font-extrabold shadow-[0_0_8px_rgba(248,113,113,0.2)]';
                            }
                          } else {
                            if (val === -1) {
                              circleContent = '-';
                              circleStyle = 'border-white/20 bg-surface-3 text-text-primary font-extrabold';
                            } else if (val !== undefined && val >= 0) {
                              circleContent = String(val);
                              circleStyle = 'border-accent bg-accent-dim text-accent font-extrabold shadow-[0_0_8px_var(--accent-dim)]';
                            } else {
                              circleContent = '?';
                              circleStyle = 'border-white/20 bg-surface-2 text-text-secondary';
                            }
                          }

                          return (
                            <button
                              key={wd.dateStr}
                              disabled={wd.isFuture || !isActiveDay}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDayClick(e, habit, wd.dateStr);
                              }}
                              className={`
                                w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex flex-col items-center justify-center transition-all cursor-pointer
                                ${circleStyle}
                                ${wd.isToday ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-1 backdrop-blur-sm bg-accent/5 dark:bg-accent/10 shadow-lg shadow-accent/20 animate-[pulse_3s_ease-in-out_infinite]' : ''}
                                ${wd.isFuture ? 'opacity-20 cursor-not-allowed pointer-events-none' : 'hover:border-text-secondary hover:scale-105 hover:shadow-md active:scale-95'}
                              `}
                              title={`${wd.dayNameShort} ${wd.dayOfMonth}: ${isTarget1Daily
                                ? val === 1 ? 'Completed' : val === -1 ? 'Skipped' : val === undefined ? 'Unlogged' : 'Failed'
                                : val === -1 ? 'Skipped' : val !== undefined ? `${val} logged` : 'Unlogged'
                                }`}
                            >
                              <span className="text-xs font-bold leading-none mb-1 opacity-80">{wd.dayLabel}</span>
                              <span className="leading-none text-xs sm:text-sm font-extrabold font-mono">{circleContent}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Floating Action Button (FAB) ── */}
      <button
        onClick={onAddHabitClick}
        className="fixed bottom-24 md:bottom-6 right-6 w-12 h-12 flex items-center justify-center rounded-full bg-accent text-white border border-accent shadow-2xl hover:bg-accent-hover hover:border-accent-hover hover:scale-110 active:scale-95 transition-all cursor-pointer z-40"
        aria-label="Add new habit"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Symmetrical Floating Toast Notifications (Safe Above Mobile Navigation Pills) ── */}
      {syncToastMessage && (
        <div 
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-max max-w-[85vw] animate-fade-in"
          style={{ transform: 'translateX(-50%)' }}
        >
          <div className={`flex items-center gap-2.5 px-4.5 py-3 rounded-2xl border text-xs font-bold shadow-xl backdrop-blur-md ${
            syncToastMessage.error
              ? 'bg-rose-500/10 border-rose-500/25 text-rose-400 shadow-rose-500/5'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-emerald-500/5'
          }`}>
            <span className="text-sm">{syncToastMessage.error ? '❌' : '⚡'}</span>
            <span className="truncate">{syncToastMessage.text}</span>
          </div>
        </div>
      )}

    </div>
  );
}
