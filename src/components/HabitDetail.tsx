import { useState, useEffect } from 'react';
import { 
  ArrowLeft, Edit2, Trash2, Calendar, TrendingUp, BarChart2, PieChart, 
  AlertTriangle, Plus, ChevronLeft, ChevronRight, Sparkles
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, LabelList, Cell
} from 'recharts';
import { format, startOfWeek, differenceInDays, startOfMonth } from 'date-fns';
import type { Habit, HabitEntry } from '../db/database';
import { getEntriesForHabit } from '../db/entries';
import { scoreHabit, getScoreColorClass, calculateStreak } from '../scoring/engine';
import { getTimeline, movingAverage, trendDirection, weekdayPattern, distribution } from '../scoring/trends';

interface HabitDetailProps {
  habit: Habit;
  onBack: () => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habitId: string) => void;
  onLogClick: (dateStr?: string) => void;
}

type PeriodType = '1w' | '1m' | '3m' | '6m';

export default function HabitDetail({ habit, onBack, onEdit, onDelete, onLogClick }: HabitDetailProps) {
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [period, setPeriod] = useState<PeriodType>('1m');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [activeMonthIdx, setActiveMonthIdx] = useState(0); // 0 is current month
  const [aggregationMode, setAggregationMode] = useState<'daily'|'weekly'|'fortnightly'|'monthly'>('daily');
  const [chartPageOffset, setChartPageOffset] = useState(0);
  const [trendPageOffset, setTrendPageOffset] = useState(0);
  const [heatmapPageOffset, setHeatmapPageOffset] = useState(0);
  const [activeWeeklyRemarkIdx, setActiveWeeklyRemarkIdx] = useState<number>(-1);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset offsets on period or aggregation change
  useEffect(() => {
    setChartPageOffset(0);
    setTrendPageOffset(0);
    setHeatmapPageOffset(0);
  }, [period, aggregationMode]);

  const isTarget1Daily = habit.frequency === 'daily' && habit.target === 1;

  // Fetch entries
  const fetchEntries = async () => {
    setLoading(true);
    try {
      const data = await getEntriesForHabit(habit.id);
      setEntries(data);
    } catch (err) {
      console.error('Error fetching habit entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [habit.id]);

  // Determine date range based on period selector and current page offset
  const getPeriodRange = (): { start: Date; end: Date; label: string } => {
    const end = new Date();
    const start = new Date();
    let label = '';

    // Adjust start date relative to new end date
    switch (period) {
      case '1w':
        start.setDate(end.getDate() - 7);
        label = 'Last 1 Week';
        break;
      case '1m':
        start.setMonth(end.getMonth() - 1);
        label = 'Last 1 Month';
        break;
      case '3m':
        start.setMonth(end.getMonth() - 3);
        label = 'Last 3 Months';
        break;
      case '6m':
        start.setMonth(end.getMonth() - 6);
        label = 'Last 6 Months';
        break;
    }
    return { start, end, label };
  };

  const { start: startDate, end: endDate } = getPeriodRange();

  // Aggregate timeline
  const fullTimeline = getTimeline(habit, entries, startDate, endDate);
  const timelineScores = fullTimeline.map(t => t.score);
  
  // Adapt MA window
  const maWindow = habit.frequency === 'daily' ? 7 : habit.frequency === 'weekly' ? 4 : 3;
  const maValues = movingAverage(timelineScores, maWindow);
  
  // Format data for Recharts Trend Line
  const chartData = fullTimeline.map((item, idx) => ({
    name: item.label,
    Score: item.score !== null ? Math.min(100, Math.round(item.score)) : 0,
    'Moving Avg': Math.min(100, Math.round(maValues[idx] || (item.score !== null ? item.score : 0))),
    value: item.actual,
  }));

  // Trend direction
  const direction = trendDirection(maValues);

  // Parse local date
  const parseLocalDate = (dateStr: string) => new Date(dateStr + 'T00:00:00');
  
  // New chart data calculation: Logged Values Over Time
  const periodEntries = entries.filter(e => {
    const d = parseLocalDate(e.date);
    return d >= startDate && d <= endDate;
  });

  const getExpectedForRange = (rStart: Date, rEnd: Date) => {
    const days = differenceInDays(rEnd, rStart) + 1;
    if (days <= 0) return 0;
    if (habit.frequency === 'daily') {
      let activeDays = 0;
      let c = new Date(rStart);
      while (c <= rEnd) {
        if (!habit.weekdays || habit.weekdays.length === 0 || habit.weekdays.includes(c.getDay())) {
          activeDays++;
        }
        c.setDate(c.getDate() + 1);
      }
      return activeDays * habit.target;
    } else if (habit.frequency === 'weekly') {
      return habit.target * (days / 7);
    } else if (habit.frequency === 'monthly') {
      return habit.target * (days / 30.44);
    }
    return habit.target;
  };

  const aggregatedData: { name: string; value: number; expected: number; tooltipRange?: string; isActive?: boolean }[] = [];

  if (aggregationMode === 'daily') {
    const map = new Map<string, number>();
    periodEntries.forEach(e => {
      if (e.value >= 0) map.set(e.date, e.value);
    });
    let curr = new Date(startDate);
    while (curr <= endDate) {
      const dStr = format(curr, 'yyyy-MM-dd');
      
      let isActive = true;
      if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0) {
        isActive = habit.weekdays.includes(curr.getDay());
      }

      aggregatedData.push({
        name: format(curr, 'MMM d'),
        value: map.get(dStr) || 0,
        expected: Number(getExpectedForRange(curr, curr).toFixed(1)),
        tooltipRange: format(curr, 'MMM d, yyyy') + (!isActive ? ' (Inactive)' : ''),
        isActive
      });
      curr.setDate(curr.getDate() + 1);
    }
  } else if (aggregationMode === 'weekly') {
    const map = new Map<string, number>();
    periodEntries.forEach(e => {
      if (e.value >= 0) {
        const weekStart = startOfWeek(parseLocalDate(e.date), { weekStartsOn: 1 });
        const key = format(weekStart, 'yyyy-MM-dd');
        map.set(key, (map.get(key) || 0) + e.value);
      }
    });
    let curr = startOfWeek(startDate, { weekStartsOn: 1 });
    const finalEnd = startOfWeek(endDate, { weekStartsOn: 1 });
    while (curr <= finalEnd) {
      const key = format(curr, 'yyyy-MM-dd');
      const endOfWeek = new Date(curr);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      const actualEnd = endOfWeek > endDate ? endDate : endOfWeek;
      aggregatedData.push({
        name: `Wk of ${format(curr, 'MMM d')}`,
        value: map.get(key) || 0,
        expected: Number(getExpectedForRange(curr, actualEnd).toFixed(1)),
        tooltipRange: `${format(curr, 'MMM d')} - ${format(endOfWeek, 'MMM d, yyyy')}`
      });
      curr.setDate(curr.getDate() + 7);
    }
  } else if (aggregationMode === 'fortnightly') {
    const map = new Map<number, number>();
    periodEntries.forEach(e => {
      if (e.value >= 0) {
        const d = parseLocalDate(e.date);
        const diff = Math.floor(differenceInDays(d, startDate) / 14);
        map.set(diff, (map.get(diff) || 0) + e.value);
      }
    });
    const totalFortnights = Math.floor(differenceInDays(endDate, startDate) / 14);
    for (let i = 0; i <= totalFortnights; i++) {
      const fStart = new Date(startDate);
      fStart.setDate(fStart.getDate() + (i * 14));
      const fEnd = new Date(fStart);
      fEnd.setDate(fEnd.getDate() + 13);
      const actualEnd = fEnd > endDate ? endDate : fEnd;
      aggregatedData.push({
        name: `${format(fStart, 'MM/dd')}`,
        value: map.get(i) || 0,
        expected: Number(getExpectedForRange(fStart, actualEnd).toFixed(1)),
        tooltipRange: `${format(fStart, 'MMM d, yyyy')} - ${format(fEnd, 'MMM d, yyyy')}`
      });
    }
  } else if (aggregationMode === 'monthly') {
    const map = new Map<string, number>();
    periodEntries.forEach(e => {
      if (e.value >= 0) {
        const mStart = startOfMonth(parseLocalDate(e.date));
        const key = format(mStart, 'yyyy-MM-dd');
        map.set(key, (map.get(key) || 0) + e.value);
      }
    });
    let curr = startOfMonth(startDate);
    const finalEnd = startOfMonth(endDate);
    while (curr <= finalEnd) {
      const key = format(curr, 'yyyy-MM-dd');
      const mEnd = new Date(curr.getFullYear(), curr.getMonth() + 1, 0);
      const actualEnd = mEnd > endDate ? endDate : mEnd;
      aggregatedData.push({
        name: format(curr, 'MMM yy'),
        value: map.get(key) || 0,
        expected: Number(getExpectedForRange(curr, actualEnd).toFixed(1)),
        tooltipRange: format(curr, 'MMMM yyyy')
      });
      curr.setMonth(curr.getMonth() + 1);
    }
  }

  // Stats calculation
  const latestScore = timelineScores.length > 0 ? timelineScores[timelineScores.length - 1] : 0;
  const validTimelineScores = timelineScores.filter((s): s is number => s !== null);
  const averageScoreVal = validTimelineScores.length > 0 
    ? Math.round(validTimelineScores.reduce((a, b) => a + b, 0) / validTimelineScores.length) 
    : 0;

  // Count of completions (score >= 100)
  const completedPeriods = fullTimeline.filter(p => p.score !== null && p.score >= 100).length;
  // Total actual logged value in period
  const totalActualLogged = periodEntries.reduce((sum, e) => e.value >= 0 ? sum + e.value : sum, 0);

  // Render direction badge
  const renderTrendBadge = () => {
    switch (direction) {
      case 'improving':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">▲ Improving</span>;
      case 'declining':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">▼ Declining</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-surface-3 text-text-secondary border border-border">▬ Stable</span>;
    }
  };

  // Custom Calendar Heatmap generation
  const renderCalendarHeatmap = () => {
    if (habit.frequency === 'daily') {
      // Create a 7 row (weekdays) x N columns (weeks) grid of cells.
      // Let's generate cells from the Monday of the start date to Sunday of the end date.
      const start = new Date(startDate);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff); // Shift to Monday

      const cells: { dateStr: string; score: number | null; date: Date }[] = [];
      const entryMap = new Map<string, number>();
      for (const e of entries) {
        entryMap.set(e.date, e.value);
      }

      const today = new Date();
      const current = new Date(start);
      while (current <= today) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const val = entryMap.get(dateStr);
        const score = scoreHabit(habit, val !== undefined ? val : -2, habit.frequency === 'daily' ? dateStr : undefined);

        cells.push({
          dateStr,
          score,
          date: new Date(current)
        });
        current.setDate(current.getDate() + 1);
      }

      // Group cells into weeks (7 cells each)
      const weeks: typeof cells[] = [];
      let tempWeek: typeof cells = [];
      cells.forEach((cell, idx) => {
        tempWeek.push(cell);
        if (tempWeek.length === 7 || idx === cells.length - 1) {
          weeks.push(tempWeek);
          tempWeek = [];
        }
      });

      const maxVisibleWeeks = windowWidth < 640 ? 12 : windowWidth < 1024 ? 24 : 52;
      const totalWeeks = weeks.length;
      const startIndex = Math.max(0, totalWeeks - (heatmapPageOffset + 1) * maxVisibleWeeks);
      const endIndex = totalWeeks - heatmapPageOffset * maxVisibleWeeks;
      const visibleWeeks = weeks.slice(startIndex, endIndex);

      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      return (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs text-text-secondary font-semibold">
            <span>{format(endDate, 'MMM d, yyyy')}</span>
            <span>{format(startDate, 'MMM d, yyyy')}</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <div className="grid grid-rows-7 gap-1.5 pr-1 text-[10px] text-text-tertiary font-semibold">
              {dayLabels.map((lbl, idx) => (
                <div key={idx} className="h-6 flex items-center">{lbl}</div>
              ))}
            </div>

            <div className="flex gap-1">
              {visibleWeeks.slice().reverse().map((week, wIdx) => (
                <div key={wIdx} className="grid grid-rows-7 gap-1.5">
                  {week.map((cell, cIdx) => {
                    const score = cell.score;
                    const val = entryMap.get(cell.dateStr);

                    let bgColor = 'transparent';
                    let opacityVal = '0.1';
                    let statusText = score !== null ? `Score ${Math.round(score)}%` : 'Skipped -';

                    if (isTarget1Daily) {
                      if (val === 1) {
                        bgColor = habit.color || 'var(--accent)';
                        opacityVal = '0.9';
                        statusText = 'Complete ✔';
                      } else if (val === -1) {
                        bgColor = '#333333';
                        opacityVal = '0.4';
                        statusText = 'Skipped -';
                      } else if (val === 0) {
                        bgColor = '#ef4444';
                        opacityVal = '0.7';
                        statusText = 'Failed ✘';
                      } else {
                        bgColor = 'var(--surface-3)';
                        opacityVal = '0.35';
                        statusText = 'Unlogged';
                      }
                    } else {
                      if (val === -1) {
                        bgColor = '#333333';
                        opacityVal = '0.4';
                        statusText = 'Skipped -';
                      } else if (val !== undefined && val >= 0) {
                        bgColor = habit.color || 'var(--accent)';
                        opacityVal = '0.9';
                        statusText = `Logged ${val}`;
                      } else {
                        bgColor = 'var(--surface-3)';
                        opacityVal = '0.35';
                        statusText = 'Unlogged';
                      }
                    }

                    const remarkItem = entries.find(e => e.date === cell.dateStr);
                    const remarkText = remarkItem?.remark ? ` Note: "${remarkItem.remark}"` : '';
                    const tooltipText = `${cell.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${statusText}${remarkText}`;

                    return (
                      <div
                        key={cIdx}
                        className="w-6 h-6 rounded-sm transition-all border border-border/10 hover:ring-1 hover:ring-accent relative group cursor-pointer hover:z-50"
                        title={tooltipText}
                      >
                        <div 
                          className="absolute inset-0 rounded-sm pointer-events-none"
                          style={{ 
                            backgroundColor: bgColor,
                            opacity: opacityVal,
                          }}
                        />
                        <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-mono pointer-events-none drop-shadow-md opacity-90 ${val === undefined ? 'text-text-tertiary/60 font-bold' : 'text-white'}`}>
                          {val === -1 ? '-' : (val !== undefined ? (isTarget1Daily && val === 1 ? '✓' : val) : '?')}
                        </span>
                        {remarkItem?.remark && (
                          <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        )}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block bg-surface-1 text-text-primary text-xs font-bold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap z-50 border border-border">
                          {tooltipText}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 justify-end text-xs text-text-tertiary pr-1">
            <span>Less</span>
            <div className="w-2.5 h-2.5 rounded-sm bg-surface-4 border border-border/10 opacity-10" />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: habit.color || '#a78bfa', opacity: '0.2' }} />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: habit.color || '#a78bfa', opacity: '0.5' }} />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: habit.color || '#a78bfa', opacity: '0.9' }} />
            <span>More</span>
          </div>
        </div>
      );
    } else if (habit.frequency === 'weekly') {
      return (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {fullTimeline.slice(-24).map((p, idx) => {
            let opacity = 0.05;
            let displayVal = String(p.actual);
            let scoreText = p.score !== null ? `${Math.round(p.score)}%` : 'Skipped';
            let circleBg = '#222222';

            if (p.actual === -2) {
              displayVal = '?';
            } else if (p.actual === -1) {
              displayVal = '-';
            }

            if (p.score !== null) {
              if (p.score >= 75) opacity = 0.9;
              else if (p.score >= 40) opacity = 0.5;
              else if (p.score > 0) opacity = 0.2;
              circleBg = p.score > 0 ? habit.color || '#a78bfa' : '#222222';
            }

            return (
              <div 
                key={idx} 
                className="bg-surface-2 border border-border rounded-xl p-3 flex flex-col items-center justify-between min-h-22.5"
              >
                <span className="text-[9px] text-text-tertiary font-semibold text-center leading-tight">{p.label}</span>
                <div 
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-surface-1 font-mono transition-all"
                  style={{ 
                    backgroundColor: circleBg,
                    opacity: p.score !== null && p.score > 0 ? opacity : 0.3
                  }}
                >
                  {displayVal}
                </div>
                <span className="text-[10px] font-bold text-text-primary">{scoreText}</span>
              </div>
            );
          })}
        </div>
      );
    } else {
      return (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {fullTimeline.slice(-12).map((p, idx) => {
            let opacity = 0.05;
            let displayVal = String(p.actual);
            let scoreText = p.score !== null ? `${Math.round(p.score)}%` : 'Skipped';
            let circleBg = '#222222';

            if (p.actual === -2) {
              displayVal = '?';
            } else if (p.actual === -1) {
              displayVal = '-';
            }

            if (p.score !== null) {
              if (p.score >= 75) opacity = 0.9;
              else if (p.score >= 40) opacity = 0.5;
              else if (p.score > 0) opacity = 0.2;
              circleBg = p.score > 0 ? habit.color || '#a78bfa' : '#222222';
            }

            return (
              <div 
                key={idx} 
                className="bg-surface-2 border border-border rounded-xl p-3 flex flex-col items-center justify-between min-h-22.5"
              >
                <span className="text-[9px] text-text-tertiary font-semibold text-center leading-tight">{p.label}</span>
                <div 
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-surface-1 font-mono transition-all"
                  style={{ 
                    backgroundColor: circleBg,
                    opacity: p.score !== null && p.score > 0 ? opacity : 0.3
                  }}
                >
                  {displayVal}
                </div>
                <span className="text-[10px] font-bold text-text-primary">{scoreText}</span>
              </div>
            );
          })}
        </div>
      );
    }
  };

  // 12-Month Calendar View
  const renderTwelveMonthCalendar = () => {
    const today = new Date();
    const months = [];
    
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      });
    }

    const { year, month, label } = months[activeMonthIdx];

    const entryMap = new Map<string, number>();
    for (const e of entries) {
      entryMap.set(e.date, e.value);
    }

    const getLocalDateStr = (y: number, m: number, dayOfMonth: number) => {
      const pad = (num: number) => String(num).padStart(2, '0');
      return `${y}-${pad(m + 1)}-${pad(dayOfMonth)}`;
    };

    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    const days = [];
    for (let p = 0; p < startOffset; p++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }

    // Pad the days array with trailing nulls so it always has exactly 42 elements (6 full rows * 7 days)
    // This blocks UI shift layouts by locking the grid height regardless of row variations.
    while (days.length < 42) {
      days.push(null);
    }

    return (
      <div className="flex flex-col space-y-5 mb-4">
        <div className="flex items-center justify-between bg-surface-1/60 backdrop-blur-md border border-border hover:border-accent/30 rounded-2xl p-4 shadow-sm transition-all mb-4">
          <button
            onClick={() => setActiveMonthIdx(prev => Math.min(prev + 1, 11))}
            disabled={activeMonthIdx === 11}
            className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-text-secondary hover:text-text-primary disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex flex-col items-center">
             <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: habit.color || 'var(--accent)' }}>Month</span>
             <span className="text-base sm:text-lg font-extrabold text-text-primary tracking-tight">{label}</span>
          </div>

          <button
            onClick={() => setActiveMonthIdx(prev => Math.max(prev - 1, 0))}
            disabled={activeMonthIdx === 0}
            className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-text-secondary hover:text-text-primary disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-surface-2/40 border border-border/40 rounded-xl p-4 flex flex-col items-center">
          <div className="w-full max-w-sm">
            <div className="grid grid-cols-7 gap-1.5 text-xs font-bold text-text-tertiary text-center mb-2">
              {dayLabels.map((lbl, idx) => (
                <div key={idx}>{lbl}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
            {days.map((day, dIdx) => {
              if (day === null) {
                return <div key={`empty-${dIdx}`} className="aspect-square w-full" />;
              }

              const dateStr = getLocalDateStr(year, month, day);
              const val = entryMap.get(dateStr);
              const hasEntry = entryMap.has(dateStr);

              let isActiveDay = true;
              if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0) {
                const dayOfWeek = new Date(year, month, day).getDay();
                isActiveDay = habit.weekdays.includes(dayOfWeek);
              }

              let cellClass = 'border-border text-text-secondary bg-surface-2/30';

              if (!isActiveDay) {
                cellClass = 'border-transparent bg-surface-1 text-text-tertiary opacity-30 cursor-not-allowed';
              }

              let score = scoreHabit(habit, val !== undefined ? val : -2, habit.frequency === 'daily' ? dateStr : undefined);

              if (val === -1) {
                cellClass = 'border-white/20 bg-surface-3 text-text-primary font-bold';
              } else if (val !== undefined && hasEntry) {
                if (isTarget1Daily) {
                  if (val === 1) {
                    cellClass = 'font-extrabold';
                  } else {
                    cellClass = 'border-danger bg-danger/20 text-danger font-extrabold shadow-[0_0_4px_rgba(248,113,113,0.15)]';
                  }
                } else {
                  if (score !== null) {
                    if (score >= 75) {
                      cellClass = 'font-extrabold';
                    } else if (score >= 40) {
                      cellClass = 'font-bold opacity-90';
                    } else {
                      cellClass = 'border-danger bg-danger/20 text-danger font-extrabold shadow-[0_0_4px_rgba(239,68,68,0.15)]';
                    }
                  }
                }
              }

              const showTopRightValue = !isTarget1Daily && val !== undefined && val !== -2 && val !== -1;
              const displayValue = val === -1 ? '-' : String(val);

              // Use custom inline styles with chosen habit color instead of hardcoded tailwind purple
              let customInlineStyle: React.CSSProperties = {};
              if (val !== undefined && hasEntry && val !== -1) {
                if (isTarget1Daily) {
                  if (val === 1) {
                    customInlineStyle = {
                      borderColor: habit.color || 'var(--accent)',
                      backgroundColor: `${habit.color || 'var(--accent)'}20`,
                      color: habit.color || 'var(--accent)',
                      boxShadow: `0 0 6px ${habit.color || 'var(--accent)'}15`
                    };
                  }
                } else {
                  if (score !== null && score >= 40) {
                    customInlineStyle = {
                      borderColor: habit.color || 'var(--accent)',
                      backgroundColor: `${habit.color || 'var(--accent)'}${score >= 75 ? '20' : '10'}`,
                      color: habit.color || 'var(--accent)',
                      boxShadow: score >= 75 ? `0 0 6px ${habit.color || 'var(--accent)'}15` : undefined
                    };
                  }
                }
              }

              return (
                <div
                  key={dateStr}
                  onClick={() => isActiveDay && onLogClick(dateStr)}
                  style={customInlineStyle}
                  className={`
                    aspect-square w-full rounded-md border flex flex-col items-center justify-center text-xs font-medium transition-all relative group
                    ${isActiveDay ? 'cursor-pointer hover:scale-105 hover:border-text-secondary active:scale-95 hover:shadow-md' : 'cursor-not-allowed'}
                    ${cellClass}
                  `}
                  title={`${dateStr}: ${val !== undefined ? (val === -1 ? 'Skipped' : val) : 'Unlogged'}`}
                >
                  <span className="z-10 leading-none">{isActiveDay ? day : ''}</span>
                  {isActiveDay && val === undefined && (
                    <span className="text-[9px] text-text-tertiary/40 font-bold mt-0.5 font-mono select-none">?</span>
                  )}
                  {isTarget1Daily && val !== undefined && val !== -2 && isActiveDay && (
                    <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: val === 1 ? (habit.color || 'var(--accent)') : 'var(--color-danger)' }} />
                  )}
                  {showTopRightValue && isActiveDay && (
                    <div className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-white flex items-center justify-center text-[8px] sm:text-[9px] font-extrabold shadow-sm z-20" style={{ backgroundColor: habit.color || 'var(--accent)' }}>
                      {displayValue}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Custom tooltips for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-4 border border-border px-3 py-2 rounded-lg shadow-xl text-xs space-y-1">
          <p className="font-semibold text-text-primary mb-1">{label}</p>
          {payload.map((p: any, index: number) => {
            const rawVal = p.payload.value;
            const scoreVal = p.value;
            let displayVal = `${scoreVal}%`;

            if (isTarget1Daily && p.name === 'Score') {
              displayVal = scoreVal === 100 ? 'Complete ✔' : scoreVal === 50 ? 'Unsure ?' : rawVal === 0 ? 'Failed ✘' : 'Unset _';
            }

            return (
              <p key={index} style={{ color: p.color || habit.color }} className="font-mono">
                {p.name}: <span className="font-bold">{displayVal}</span>
              </p>
            );
          })}
          <p className="text-[10px] text-text-tertiary">
            {isTarget1Daily 
              ? `Status: ${payload[0].payload.value === 1 ? 'Complete ✔' : payload[0].payload.value === 0.5 ? 'Unsure ?' : payload[0].payload.value === 0 ? 'Failed ✘' : 'Unset _'}`
              : `Logged: ${payload[0].payload.value}`
            }
          </p>
        </div>
      );
    }
    return null;
  };

  const weeklyPatternData = weekdayPattern(entries, habit);
  const distributionData = distribution(timelineScores);

  return (
    <div 
      className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6"
      style={{
        '--accent': habit.color || '#a78bfa',
        '--accent-dim': `${habit.color || '#a78bfa'}1f`,
        '--accent-muted': `${habit.color || '#a78bfa'}0d`,
      } as React.CSSProperties}
    >
      
      {/* ── Top Header Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-transparent hover:border-border transition-all cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <span className="text-3xl">{habit.icon}</span>
            <div>
              <h1 className="text-lg font-bold text-text-primary tracking-tight leading-tight">{habit.name}</h1>
              {habit.description && (
                <p className="text-xs text-text-secondary bg-surface-2 py-1 px-2 border border-border/40 rounded-lg max-w-sm mt-1 mb-1 leading-normal italic">{habit.description}</p>
              )}
              <p className="text-xs text-text-tertiary">
                <span className="capitalize">{habit.frequency}</span> • {habit.type === 'positive' ? 'Positive (Target:' : 'Limiting (Limit:'} {habit.target}/period)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center w-full sm:w-auto gap-2 mt-4 sm:mt-0">
          <button
            onClick={() => onLogClick()}
            className="flex-1 sm:flex-none px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-bold text-accent bg-accent-dim border border-accent/20 hover:border-accent/40 rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Log Value
          </button>
          <button
            onClick={() => onEdit(habit)}
            className="flex-1 sm:flex-none px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-bold text-text-secondary bg-surface-2 border border-border hover:border-surface-4 hover:bg-surface-3 hover:text-text-primary rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-bold text-rose-400 bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/10 rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* ── Delete Confirmation Overlay ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm bg-surface-1 border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-semibold">Delete Habit?</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to delete <strong className="text-text-primary">"{habit.name}"</strong>? This will permanently delete all logged entry history. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-text-secondary bg-transparent border border-border hover:bg-surface-3 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(habit.id);
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-500 border border-rose-500 hover:bg-rose-600 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Highlights Card ── */}
      <div className="flex flex-col gap-4">
        {/* Row 1: Key Achievements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card: Avg Score */}
          <div className="group relative overflow-hidden bg-surface-1/70 backdrop-blur-md border border-border/85 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:bg-white/10 dark:hover:bg-white/5 hover:border-accent/25 cursor-default shadow-xs hover:shadow-md hover:-translate-y-0.5 min-h-[105px]">
            <div>
              <span className="text-[11px] sm:text-xs font-bold text-text-tertiary uppercase tracking-wider block whitespace-nowrap">Average Score</span>
              <span className={`text-2xl sm:text-3xl font-extrabold font-mono mt-1.5 block leading-none ${getScoreColorClass(averageScoreVal).split(' ')[0]}`}>
                {averageScoreVal}%
              </span>
            </div>
            <span className="text-[10px] text-text-tertiary font-semibold block mt-1.5 whitespace-nowrap">
              {completedPeriods} / {validTimelineScores.length} met in average
            </span>
          </div>

          {/* Card: Total Logged */}
          <div className="group relative overflow-hidden bg-surface-1/70 backdrop-blur-md border border-border/85 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:bg-white/10 dark:hover:bg-white/5 hover:border-accent/25 cursor-default shadow-xs hover:shadow-md hover:-translate-y-0.5 min-h-[105px]">
            <div>
              <span className="text-[11px] sm:text-xs font-bold text-text-tertiary uppercase tracking-wider block whitespace-nowrap">Total Logged</span>
              <span className="text-2xl sm:text-3xl font-extrabold font-mono mt-1.5 block leading-none text-text-primary">
                {totalActualLogged}
              </span>
            </div>
            <span className="text-[10px] text-text-tertiary font-semibold block mt-1.5 whitespace-nowrap">
              sum of all logged values
            </span>
          </div>
        </div>

        {/* Row 2: Status Indicators (Current Score + Trend Slope) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card: Current Score */}
          <div className="group relative overflow-hidden bg-surface-1/70 backdrop-blur-md border border-border/85 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:bg-white/10 dark:hover:bg-white/5 hover:border-accent/25 cursor-default shadow-xs hover:shadow-md hover:-translate-y-0.5 min-h-[105px]">
            <div>
              <span className="text-[11px] sm:text-xs font-bold text-text-tertiary uppercase tracking-wider block whitespace-nowrap">Current Score</span>
              <span className={`text-base sm:text-lg font-extrabold font-mono mt-2 block leading-none ${
                latestScore !== null 
                  ? getScoreColorClass(latestScore).split(' ')[0] 
                  : 'text-text-secondary'
              }`}>
                {isTarget1Daily 
                  ? latestScore === 100 
                    ? 'Complete ✔' 
                    : latestScore === null
                      ? 'Skipped -'
                      : latestScore === 0
                        ? 'Failed ✘'
                        : 'Unlogged ?'
                  : latestScore !== null
                    ? `${Math.round(latestScore)}%`
                    : 'Skipped -'
                }
              </span>
            </div>
            {latestScore !== null && !isTarget1Daily ? (
              <span className="text-[10px] text-text-tertiary font-semibold block mt-2 whitespace-nowrap">
                Current: {fullTimeline[fullTimeline.length - 1]?.actual ?? 0} / {habit.target}
              </span>
            ) : (
              <span className="text-[10px] text-text-tertiary font-semibold block mt-2 whitespace-nowrap">
                daily check
              </span>
            )}
          </div>

          {/* Card: Trend Slope */}
          <div className="group relative overflow-hidden bg-surface-1/70 backdrop-blur-md border border-border/85 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:bg-white/10 dark:hover:bg-white/5 hover:border-accent/25 cursor-default shadow-xs hover:shadow-md hover:-translate-y-0.5 min-h-[105px]">
            <div>
              <span className="text-[11px] sm:text-xs font-bold text-text-tertiary uppercase tracking-wider block whitespace-nowrap">Trend Slope</span>
              <div className="mt-2 block leading-none">
                {renderTrendBadge()}
              </div>
            </div>
            <span className="text-[10px] text-text-tertiary font-semibold block mt-2 whitespace-nowrap">
              direction of progress
            </span>
          </div>
        </div>

        {/* Row 3: Streak Full Width */}
        <div className="grid grid-cols-1 gap-4 text-left sm:text-left">
          {/* Card: Current Streak */}
          <div className="group relative overflow-hidden bg-surface-1/70 backdrop-blur-md border border-border/85 rounded-xl p-6.5 flex flex-col justify-between transition-all duration-300 hover:bg-white/10 dark:hover:bg-white/5 hover:border-accent/25 cursor-default shadow-xs hover:shadow-md hover:-translate-y-0.5 min-h-[115px]">
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-3.5">
              <span className="text-[11px] sm:text-xs font-bold text-text-tertiary uppercase tracking-wider block whitespace-nowrap">Current Streak</span>
              <span className="text-3xl sm:text-2xl font-extrabold font-mono flex items-center justify-center sm:justify-start gap-2.5 leading-none text-text-primary">
                <span className="animate-pulse">🔥</span>
                <span>{calculateStreak(habit, entries)}</span>
              </span>
            </div>
            <span className="text-[11px] sm:text-[10px] text-text-tertiary font-semibold block text-center sm:text-left mt-3.5 whitespace-nowrap">
              {habit.frequency === 'daily' ? 'days' : habit.frequency === 'weekly' ? 'weeks' : 'months'} active streak
            </span>
          </div>
        </div>
      </div>

      {/* ── Period Selector Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-6 pt-4 gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-extrabold text-text-primary uppercase tracking-wider">
            Analysis Period
          </span>
          <span className="text-xs text-text-tertiary">Select the time frame for all charts below</span>
        </div>
        <div className="flex gap-2 border border-border rounded-xl p-1 bg-surface-2 self-start sm:self-center">
          {(['1w', '1m', '3m', '6m'] as PeriodType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-6 py-2 text-xs font-bold rounded-lg uppercase transition-all cursor-pointer ${
                period === p 
                  ? 'bg-accent/20 text-accent shadow-sm border border-accent/30' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 1: Logged Values Over Time */}
          <div className="analytics-section">
            <div className="analytics-section-header border-b border-border bg-surface-2/30 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Logged Values Over Time</h3>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setChartPageOffset(prev => prev + 1)}
                    disabled={(() => {
                      const maxVisibleBars = windowWidth < 640 ? 7 : windowWidth < 1024 ? 14 : 31;
                      const totalBars = aggregatedData.length;
                      const startIndex = Math.max(0, totalBars - (chartPageOffset + 1) * maxVisibleBars);
                      return startIndex <= 0;
                    })()}
                    className="p-1 rounded bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-border/40 disabled:opacity-20 disabled:pointer-events-none"
                    title="Previous Bars"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setChartPageOffset(prev => Math.max(0, prev - 1))}
                    disabled={chartPageOffset === 0}
                    className="p-1 rounded bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-border/40 disabled:opacity-20 disabled:pointer-events-none"
                    title="Next Bars"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-1 bg-surface-3 p-1 rounded-lg">
                {(['daily', 'weekly', 'fortnightly', 'monthly'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setAggregationMode(mode)}
                    className={`px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-colors capitalize ${aggregationMode === mode ? 'bg-surface-1 text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="analytics-section-body pt-5">
              <div className="h-70 w-full chart-container min-w-0">
                {aggregatedData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
                    No entries logged in this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height={265}>
                    {(() => {
                      const maxVisibleBars = windowWidth < 640 ? 7 : windowWidth < 1024 ? 14 : 31;
                      const totalBars = aggregatedData.length;
                      const startIndex = Math.max(0, totalBars - (chartPageOffset + 1) * maxVisibleBars);
                      const endIndex = totalBars - chartPageOffset * maxVisibleBars;
                      const visibleData = aggregatedData.slice(startIndex, endIndex);

                      return (
                        <BarChart data={visibleData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={9} tickLine={false} />
                          <YAxis 
                            stroke="var(--text-secondary)" 
                            fontSize={9} 
                            tickLine={false} 
                            domain={[0, (dataMax: number) => {
                              const chartMax = visibleData.reduce((m, item) => Math.max(m, item.value, item.expected || 0), 0);
                              return Math.max(dataMax, Math.ceil(chartMax * 1.15));
                            }]} 
                          />
                          <Tooltip 
                            cursor={false}
                            formatter={(value, _name, props) => [
                              props.payload.expected && props.payload.expected > 0 
                                ? `${value} / ${props.payload.expected}` 
                                : value, 
                              'Logged Value'
                            ]}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.tooltipRange || label}
                            contentStyle={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}
                            itemStyle={{ color: 'var(--text-primary)' }}
                          />
                          <Bar 
                            dataKey="value" 
                            radius={[4, 4, 0, 0]} 
                            maxBarSize={40}
                          >
                            {visibleData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.isActive === false ? '#333333' : (habit.color || '#a78bfa')} />
                            ))}
                            <LabelList 
                              dataKey="value" 
                              position="top" 
                              content={(props: any) => {
                                const { x, y, width, value, index } = props;
                                const expected = visibleData[index]?.expected;
                                const text = (expected && expected > 0) ? `${value}/${expected}` : value;
                                return (
                                  <text x={x + width / 2} y={y - 8} fill="var(--text-secondary)" fontSize={9} textAnchor="middle" fontWeight="bold">
                                    {text}
                                  </text>
                                );
                              }}
                            />
                          </Bar>
                        </BarChart>
                      );
                    })()}
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
          
          <div className="analytics-section">
            <div className="analytics-section-header border-b border-border bg-surface-2/30 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Completions Intensity</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHeatmapPageOffset(prev => prev + 1)}
                  disabled={(() => {
                    const start = new Date(startDate);
                    const day = start.getDay();
                    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
                    start.setDate(diff);
                    const cells: { dateStr: string; score: number | null; date: Date }[] = [];
                    const current = new Date(start);
                    while (current <= new Date()) { current.setDate(current.getDate() + 1); cells.push({dateStr: '', score: 0, date: new Date()}); }
                    const weeks = []; let tempWeek: typeof cells = [];
                    cells.forEach((cell, idx) => { tempWeek.push(cell); if (tempWeek.length === 7 || idx === cells.length - 1) { weeks.push(tempWeek); tempWeek = []; }});
                    const maxVisibleWeeks = windowWidth < 640 ? 12 : windowWidth < 1024 ? 24 : 52;
                    const startIndex = Math.max(0, weeks.length - (heatmapPageOffset + 1) * maxVisibleWeeks);
                    return startIndex <= 0;
                  })()}
                  className="p-1 rounded bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-border/40 disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setHeatmapPageOffset(prev => Math.max(0, prev - 1))}
                  disabled={heatmapPageOffset === 0}
                  className="p-1 rounded bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-border/40 disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="analytics-section-body pt-5">
              {renderCalendarHeatmap()}
            </div>
          </div>

          <div className="analytics-section">
            <div className="analytics-section-header border-b border-border bg-surface-2/30">
              <Calendar className="w-4 h-4 text-accent" />
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">12-Month Calendar</h3>
            </div>
            <div className="analytics-section-body pt-5 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
              {renderTwelveMonthCalendar()}
            </div>
          </div>

          <div className="analytics-section">
            <div className="analytics-section-header border-b border-border bg-surface-2/30 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Score Progress & Moving Avg</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTrendPageOffset(prev => prev + 1)}
                  disabled={(() => {
                    const maxVisiblePoints = windowWidth < 640 ? 14 : windowWidth < 1024 ? 30 : 60;
                    const totalPoints = chartData.length;
                    const startIndex = Math.max(0, totalPoints - (trendPageOffset + 1) * maxVisiblePoints);
                    return startIndex <= 0;
                  })()}
                  className="p-1 rounded bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-border/40 disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setTrendPageOffset(prev => Math.max(0, prev - 1))}
                  disabled={trendPageOffset === 0}
                  className="p-1 rounded bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-border/40 disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="analytics-section-body pt-5">
              <div className="h-70 w-full chart-container min-w-0">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
                    No entries logged in this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height={265}>
                    {(() => {
                      const maxVisiblePoints = windowWidth < 640 ? 14 : windowWidth < 1024 ? 30 : 60;
                      const totalPoints = chartData.length;
                      const startIndex = Math.max(0, totalPoints - (trendPageOffset + 1) * maxVisiblePoints);
                      const endIndex = totalPoints - trendPageOffset * maxVisiblePoints;
                      const visibleChartData = chartData.slice(startIndex, endIndex);
                      
                      return (
                        <LineChart data={visibleChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={9} tickLine={false} />
                          <YAxis domain={[0, 100]} stroke="var(--text-secondary)" fontSize={9} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <ReferenceLine y={100} stroke={habit.color || '#a78bfa'} strokeDasharray="3 3" opacity={0.3} label={{ value: 'Target', position: 'insideTopRight', fill: '#555', fontSize: 8 }} />
                          <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.3} label={{ value: 'Limit', position: 'insideBottomRight', fill: '#555', fontSize: 8 }} />
                          <Line 
                            type="monotone" 
                            dataKey="Score" 
                            stroke={habit.color || '#a78bfa'} 
                            strokeWidth={1} 
                            opacity={0.35}
                            dot={false} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="Moving Avg" 
                            stroke={habit.color || '#a78bfa'} 
                            strokeWidth={2.5} 
                            dot={{ r: 1.5, strokeWidth: 0, fill: habit.color || '#a78bfa' }} 
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      );
                    })()}
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Additional analysis sections stacked vertically for full width */}
          <div className="space-y-6">
            
            {/* Section 4: Weekday Pattern (only for daily habits) */}
            {habit.frequency === 'daily' && (
              <div className="analytics-section">
                <div className="analytics-section-header border-b border-border bg-surface-2/30">
                  <BarChart2 className="w-4 h-4 text-accent" />
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Weekday Pattern</h3>
                </div>
                <div className="analytics-section-body pt-5">
                  <div className="h-[240px] w-full chart-container min-w-0">
                    <ResponsiveContainer width="99%" height={220}>
                        <BarChart data={weeklyPatternData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                          <XAxis dataKey="dayName" stroke="var(--text-secondary)" fontSize={9} tickLine={false} />
                          <YAxis domain={[0, 115]} stroke="var(--text-secondary)" fontSize={9} tickLine={false} tickFormatter={(val) => Math.min(100, val).toString()} />
                        <Tooltip 
                          cursor={false}
                          formatter={(value) => [`${value}%`, 'Avg Score']} 
                          contentStyle={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}
                          itemStyle={{ color: 'var(--text-primary)' }}
                          labelStyle={{ color: 'var(--text-secondary)' }}
                        />
                        <Bar 
                          dataKey="averageScore" 
                          radius={[4, 4, 0, 0]} 
                          maxBarSize={40}
                        >
                          {weeklyPatternData.map((entry, index) => {
                             let isInactive = false;
                             if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0) {
                               const dayMap: {[key: string]: number} = {'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6};
                               isInactive = !habit.weekdays.includes(dayMap[entry.dayName]);
                             }
                             return <Cell key={`cell-${index}`} fill={isInactive ? '#333333' : (habit.color || '#a78bfa')} />
                          })}
                          <LabelList dataKey="averageScore" position="top" formatter={(val: any) => `${Math.round(Number(val))}%`} fill="var(--text-secondary)" fontSize={9} offset={5} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Section 5: Distribution */}
            <div className="analytics-section">
              <div className="analytics-section-header border-b border-border bg-surface-2/30">
                <PieChart className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Score Distribution</h3>
              </div>
              <div className="analytics-section-body pt-5">
                <div className="h-[240px] w-full chart-container min-w-0">
                  <ResponsiveContainer width="99%" height={220}>
                    <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="range" stroke="var(--text-secondary)" fontSize={9} tickLine={false} />
                      <YAxis 
                        stroke="var(--text-secondary)" 
                        fontSize={9} 
                        tickLine={false} 
                        domain={[0, (dataMax: number) => Math.max(dataMax, Math.ceil(dataMax * 1.15))]}
                      />
                      <Tooltip 
                        cursor={false}
                        formatter={(value) => [value, 'Periods']}
                        contentStyle={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}
                        itemStyle={{ color: 'var(--text-primary)' }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill={habit.color || '#a78bfa'} 
                        radius={[4, 4, 0, 0]} 
                        maxBarSize={50}
                      >
                        <LabelList dataKey="count" position="top" fill="var(--text-secondary)" fontSize={9} offset={5} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Section 6: Remarks & Memos (Grouped and filterable by week matching date context) */}
            <div className="analytics-section">
              <div className="analytics-section-header border-b border-border bg-surface-2/30">
                <Sparkles className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Weekly Remarks & Memos Viewer</h3>
              </div>
              <div className="analytics-section-body pt-5">
                {(() => {
                  // Reconstruct timeline segmented into weeks based on target periods
                  const weekStartDates: Date[] = [];
                  const today = new Date();
                  const walk = new Date(startDate);
                  // Roll back walk to Monday
                  const walkDay = walk.getDay();
                  walk.setDate(walk.getDate() - (walkDay === 0 ? 6 : walkDay - 1));

                  while (walk <= today) {
                    weekStartDates.push(new Date(walk));
                    walk.setDate(walk.getDate() + 7);
                  }

                  if (weekStartDates.length === 0) {
                    return <div className="text-xs text-text-tertiary text-center py-4">No weekly ranges found in dataset.</div>;
                  }

                  // Determine selected index safely using registered state
                  const selectedIdx = activeWeeklyRemarkIdx !== -1 && activeWeeklyRemarkIdx < weekStartDates.length
                    ? activeWeeklyRemarkIdx
                    : weekStartDates.length - 1;

                  const selectedWeekStart = weekStartDates[selectedIdx];
                  const selectedWeekEnd = new Date(selectedWeekStart);
                  selectedWeekEnd.setDate(selectedWeekStart.getDate() + 6);

                  const padDateStr = (num: number) => String(num).padStart(2, '0');
                  const formatDateKey = (d: Date) => `${d.getFullYear()}-${padDateStr(d.getMonth() + 1)}-${padDateStr(d.getDate())}`;

                  const weekDaysList = [];
                  for (let i = 0; i < 7; i++) {
                    const d = new Date(selectedWeekStart);
                    d.setDate(selectedWeekStart.getDate() + i);
                    weekDaysList.push({
                      dayLabel: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
                      dateStr: formatDateKey(d),
                      date: d
                    });
                  }

                  const matchedMemos = entries.filter(e => e.date >= formatDateKey(selectedWeekStart) && e.date <= formatDateKey(selectedWeekEnd));

                  return (
                    <div className="space-y-4">
                      {/* Week selector controls */}
                      <div className="flex items-center justify-between bg-surface-2/65 p-3 rounded-xl border border-border/60">
                        <button
                          onClick={() => setActiveWeeklyRemarkIdx(Math.max(0, selectedIdx - 1))}
                          disabled={selectedIdx === 0}
                          className="p-1.5 rounded-lg bg-surface-3 border border-border text-text-secondary hover:text-text-primary disabled:opacity-25 active:scale-95 transition-all cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="text-center">
                          <span className="text-[10px] font-bold text-accent uppercase tracking-widest block mb-0.5">Week View</span>
                          <span className="text-xs font-bold text-text-primary">
                            {format(selectedWeekStart, 'MMM d, yyyy')} - {format(selectedWeekEnd, 'MMM d, yyyy')}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const nextVal = Math.min(weekStartDates.length - 1, selectedIdx + 1);
                            setActiveWeeklyRemarkIdx(nextVal);
                          }}
                          disabled={selectedIdx === weekStartDates.length - 1}
                          className="p-1.5 rounded-lg bg-surface-3 border border-border text-text-secondary hover:text-text-primary disabled:opacity-25 active:scale-95 transition-all cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Day Grid indicators indicating which day has memo */}
                      <div className="grid grid-cols-7 gap-1.5 text-center bg-surface-2/20 p-2 rounded-xl">
                        {weekDaysList.map((wd) => {
                          const item = matchedMemos.find(m => m.date === wd.dateStr);
                          const hasMemo = item?.remark && item.remark.trim().length > 0;
                          return (
                            <div key={wd.dateStr} className="flex flex-col items-center gap-1">
                              <span className="text-[10px] text-text-tertiary font-bold">{wd.dayLabel}</span>
                              <div 
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border ${
                                  hasMemo 
                                    ? 'bg-[#818cf8]/15 border-[#818cf8]/35 text-[#818cf8] font-bold shadow-xs' 
                                    : 'bg-surface-3 border-border/10 text-text-tertiary opacity-45'
                                }`}
                                title={`${wd.dateStr}: ${hasMemo ? 'Memo added' : 'No memo'}`}
                              >
                                {wd.date.getDate()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Memos List for the week */}
                      <div className="space-y-2 mt-2">
                        {(() => {
                          const activeMemos = matchedMemos.filter(m => m.remark && m.remark.trim().length > 0);
                          if (activeMemos.length === 0) {
                            return <p className="text-xs text-text-tertiary text-center py-4">No memos logged in this week.</p>;
                          }
                          return activeMemos.map((e) => (
                            <div key={e.id} className="p-3 rounded-lg bg-surface-2 border border-border/80 flex flex-col gap-1 text-xs hover:border-accent/15 transition-all">
                              <div className="flex justify-between items-center text-[10px] text-text-tertiary font-mono">
                                <span className="font-extrabold">{e.date}</span>
                                <span className="font-bold text-[#818cf8]">Val: {e.value === -1 ? 'Skipped' : e.value}</span>
                              </div>
                              <p className="text-text-secondary italic leading-relaxed select-text font-medium px-2.5 py-1 bg-surface-1 border border-border/30 rounded-md">
                                "{e.remark}"
                              </p>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

          </div>
          
        </div>
      )}
    </div>
  );
}
