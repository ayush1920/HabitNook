import { useState, useEffect } from 'react';
import { TrendingUp, Calendar, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Habit } from '../db/database';
import { getHabits } from '../db/habits';
import { db } from '../db/database';
import { getTimeline, movingAverage, trendDirection } from '../scoring/trends';
import type { TimelinePeriod } from '../scoring/trends';

interface TrendsProps {
  user: User;
  onSelectHabit: (habit: Habit) => void;
  refreshTrigger?: number;
}

interface User {
  id: string;
}

interface HabitWithTimeline extends Habit {
  timeline: TimelinePeriod[];
  maValues: number[];
  direction: 'improving' | 'declining' | 'stable';
  latestScore: number | null;
}

type PeriodType = '1w' | '1m' | '3m' | '6m';

export default function Trends({ user, onSelectHabit, refreshTrigger }: TrendsProps) {
  const [habits, setHabits] = useState<HabitWithTimeline[]>([]);
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<PeriodType>('1m');
  const [loading, setLoading] = useState(true);

  // Determine date range based on period selector
  const getPeriodRange = (): { start: Date; end: Date } => {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case '1w':
        start.setDate(end.getDate() - 7);
        break;
      case '1m':
        start.setMonth(end.getMonth() - 1);
        break;
      case '3m':
        start.setMonth(end.getMonth() - 3);
        break;
      case '6m':
        start.setMonth(end.getMonth() - 6);
        break;
    }
    return { start, end };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const activeHabits = await getHabits(user.id === 'local' ? 'local' : user.id, false);
      const { start: startDate, end: endDate } = getPeriodRange();

      const enrichedHabits: HabitWithTimeline[] = await Promise.all(
        activeHabits.map(async (habit) => {
          // Fetch entries
          const entries = await db.entries
            .where('habitId')
            .equals(habit.id)
            .toArray();

          const timeline = getTimeline(habit, entries, startDate, endDate);
          const scores = timeline.map((t) => t.score);
          const maWindow = habit.frequency === 'daily' ? 7 : habit.frequency === 'weekly' ? 4 : 3;
          const maValues = movingAverage(scores, maWindow);
          const direction = trendDirection(maValues);
          const latestScore = scores.length > 0 ? scores[scores.length - 1] : 0;

          return {
            ...habit,
            timeline,
            maValues,
            direction,
            latestScore,
          };
        })
      );

      setHabits(enrichedHabits);

      // Default select ONLY the very first habit for single graph view
      if (selectedHabitIds.length === 0 && enrichedHabits.length > 0) {
        setSelectedHabitIds([enrichedHabits[0].id]);
      }
    } catch (err) {
      console.error('Error loading trends data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id, period, refreshTrigger]);

  const toggleSelectHabit = (id: string) => {
    // Single graph select only: check off all others when selecting a particular habit
    setSelectedHabitIds([id]);
  };

  // Compile Aligned Timeline Data for Recharts
  const buildComparativeChartData = () => {
    const { start: startDate } = getPeriodRange();
    const dataPoints: any[] = [];

    // Generate daily dates for the timeline range to align different frequencies
    const current = new Date(startDate);
    const today = new Date();

    // Convert current to midnight
    current.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const getMonday = (d: Date) => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.getFullYear(), d.getMonth(), diff);
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    while (current <= today) {
      const cYear = current.getFullYear();
      const cMonth = current.getMonth();
      const cDate = current.getDate();

      const dailyKey = `${cYear}-${String(cMonth + 1).padStart(2, '0')}-${String(cDate).padStart(2, '0')}`;

      const mon = getMonday(current);
      const weeklyKey = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;

      const monthlyKey = `${cYear}-${String(cMonth + 1).padStart(2, '0')}-01`;

      const dataPoint: any = {
        name: current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        rawDate: new Date(current),
      };

      let hasData = false;

      // Add scores of selected habits for this day
      selectedHabitIds.forEach((id) => {
        const h = habits.find((item) => item.id === id);
        if (!h) return;

        let matchingPeriod: TimelinePeriod | undefined;
        if (h.frequency === 'daily') {
          matchingPeriod = h.timeline.find((t) => t.dateStr === dailyKey);
        } else if (h.frequency === 'weekly') {
          matchingPeriod = h.timeline.find((t) => t.dateStr === weeklyKey);
        } else if (h.frequency === 'monthly') {
          matchingPeriod = h.timeline.find((t) => t.dateStr === monthlyKey);
        }

        if (matchingPeriod) {
          dataPoint[h.name] = matchingPeriod.score !== null ? Math.round(matchingPeriod.score) : 0;
          hasData = true;
        } else {
          dataPoint[h.name] = 0; // Default to 0 if outside range
        }
      });

      if (hasData) {
        dataPoints.push(dataPoint);
      }

      current.setDate(current.getDate() + 1);
    }

    // Subsample data points if they are too dense
    // For 6 months, we can step every 3 days to make the chart smooth and fast.
    if (period === '6m') {
      return dataPoints.filter((_, i) => i % 3 === 0);
    }

    return dataPoints;
  };

  const comparativeChartData = buildComparativeChartData();

  // Mini sparkline data formatter for a habit card
  const getSparklineData = (h: HabitWithTimeline) => {
    return h.timeline.slice(-15).map((t, idx) => ({
      index: idx,
      score: t.score,
    }));
  };

  const renderTrendBadge = (direction: string) => {
    switch (direction) {
      case 'improving':
        return <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">▲ Improving</span>;
      case 'declining':
        return <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">▼ Declining</span>;
      default:
        return <span className="text-[10px] font-semibold text-text-secondary bg-surface-3 border border-border px-1.5 py-0.5 rounded">▬ Stable</span>;
    }
  };

  const selectedHabiting = habits.filter((h) => selectedHabitIds.includes(h.id));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6 pb-20">

      {/* Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight leading-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            Trends & Comparison
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Compare performance overlay trends and view moving average slopes.
          </p>
        </div>

        <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-surface-2 self-start sm:self-center">
          {(['1w', '1m', '3m', '6m'] as PeriodType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-[10px] font-bold rounded uppercase transition-colors cursor-pointer ${period === p
                  ? 'bg-surface-4 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
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
      ) : habits.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-2xl p-8 text-center flex flex-col items-center">
          <Calendar className="w-8 h-8 text-text-tertiary mb-3 animate-pulse" />
          <h3 className="text-sm font-semibold text-text-primary">No habits found to analyze</h3>
          <p className="text-xs text-text-secondary mt-1.5">
            Add habits and log entries to visualize trends here.
          </p>
        </div>
      ) : (
        <>
          {/* Comparative Chart Panel */}
          <div className="bg-surface-1 border border-border rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Comparative Habit Trend</h3>
              <p className="text-xs text-text-secondary mt-0.5">Select habits below to overlay their score progress.</p>
            </div>

            {/* Selector Chips */}
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => {
                const selected = selectedHabitIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() => toggleSelectHabit(h.id)}
                    className={`px-2.5 py-1 flex items-center gap-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${selected
                        ? 'bg-surface-2 text-text-primary'
                        : 'bg-transparent border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-3'
                      }`}
                    style={{ borderColor: selected ? h.color || '#a78bfa' : 'transparent' }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.color || '#a78bfa' }} />
                    <span>{h.icon}</span>
                    <span>{h.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Comparative Chart */}
            <div className="h-70 w-full pt-2 min-w-0">
              {selectedHabiting.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
                  Please select at least one habit to display trend lines.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={comparativeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="name" stroke="#555" fontSize={9} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#555" fontSize={9} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#181818', border: '1px solid #2d2d2d', borderRadius: '8px', fontSize: '12px' }}
                      labelClassName="font-semibold text-text-primary mb-1"
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: 10 }} />
                    {selectedHabiting.map((h) => (
                      <Line
                        key={h.id}
                        type="monotone"
                        dataKey={h.name}
                        stroke={h.color || '#a78bfa'}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Per-habit Trend Cards Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Individual Trend Overview
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {habits.map((h) => {
                const sparkData = getSparklineData(h);
                return (
                  <div
                    key={h.id}
                    onClick={() => onSelectHabit(h)}
                    className="group bg-surface-1 border border-border hover:border-surface-4 hover:shadow-lg rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer"
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{h.icon}</span>
                        <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                          {h.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-text-primary font-mono bg-surface-2 border border-border px-1.5 py-0.5 rounded leading-none">
                          {h.latestScore !== null ? `${Math.round(h.latestScore)}%` : 'Skipped'}
                        </span>
                        {renderTrendBadge(h.direction)}
                      </div>
                    </div>

                    {/* Sparkline chart container */}
                    <div className="w-20 h-10 flex-shrink-0">
                      {sparkData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparkData}>
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke={h.color || '#a78bfa'}
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-text-tertiary">
                          No sparkline
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
