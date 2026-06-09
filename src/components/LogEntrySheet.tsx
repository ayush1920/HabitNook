import { useState, useEffect } from 'react';
import { X, Plus, Minus, Calendar, CheckCircle2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Habit } from '../db/database';
import { db } from '../db/database';

interface LogEntrySheetProps {
  isOpen: boolean;
  onClose: () => void;
  habit: Habit | null;
  onSave: (habitId: string, date: string, value: number, remark?: string) => void;
  initialDate?: string;
}

export default function LogEntrySheet({ isOpen, onClose, habit, onSave, initialDate }: LogEntrySheetProps) {
  const [date, setDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - offset * 60 * 1000);
    return localToday.toISOString().split('T')[0];
  });
  const [value, setValue] = useState<number>(-2);
  const [remark, setRemark] = useState(''); // Short text remark/note for this date log
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const [incrementValue, setIncrementValue] = useState(1);

  // Sync date when initialDate is passed or modal opens
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('habitnook_log_increment');
      setIncrementValue(saved ? parseFloat(saved) : 1);

      if (initialDate) {
        setDate(initialDate);
      } else {
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const localToday = new Date(today.getTime() - offset * 60 * 1000);
        setDate(localToday.toISOString().split('T')[0]);
      }
    }
  }, [initialDate, isOpen]);

  // Fetch existing entry for chosen habit and date
  useEffect(() => {
    if (!habit || !isOpen) return;

    let isMounted = true;
    const fetchValue = async () => {
      setLoading(true);
      try {
        const entry = await db.entries
          .where('[habitId+date]')
          .equals([habit.id, date])
          .first();
        if (isMounted) {
          setValue(entry ? entry.value : -2); // Default to -2 (Unlogged) if no entry
          setRemark(entry?.remark || '');
        }
      } catch (err) {
        console.error('Error fetching entry:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchValue();
    return () => {
      isMounted = false;
    };
  }, [habit, date, isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [shouldRender, setShouldRender] = useState(false);
  const [animateActive, setAnimateActive] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Sync animation and mount timing
  useEffect(() => {
    if (isOpen && habit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldRender(true);
      const raf = requestAnimationFrame(() => {
        setAnimateActive(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnimateActive(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // matches the transition-duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, habit]);

  if (!shouldRender || !habit) return null;

  const handleIncrement = () => {
    setValue((v) => (v < 0 ? incrementValue : v + incrementValue));
  };

  const handleDecrement = () => {
    setValue((v) => (v < 0 ? 0 : Math.max(0, v - incrementValue)));
  };

  const handleSave = () => {
    const isSuccess = habit.type === 'positive' && (value === 1 || value >= habit.target);
    
    if (isSuccess) {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onSave(habit.id, date, value, remark.trim() || undefined);
        onClose();
      }, 600);
    } else {
      onSave(habit.id, date, value, remark.trim() || undefined);
      onClose();
    }
  };

  const isTarget1Daily = habit.frequency === 'daily' && habit.target === 1;

  let isInactiveDay = false;
  if (habit.frequency === 'daily' && habit.weekdays && habit.weekdays.length > 0) {
    const [y, m, d] = date.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    if (!habit.weekdays.includes(dayOfWeek)) {
      isInactiveDay = true;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`sheet-backdrop ${animateActive ? 'active' : ''}`}
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div className={`sheet-container ${animateActive ? 'active' : ''} flex flex-col overflow-hidden relative`}>

        {/* Success Overlay Animation */}
        {showSuccess && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface-1/60 backdrop-blur-md">
            <div className="relative">
              <div className="absolute inset-0 bg-accent rounded-full animate-ping opacity-75" />
              <div className="relative w-20 h-20 bg-accent rounded-full flex items-center justify-center shadow-lg shadow-accent/40">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xl">{habit.icon}</span>
            <div>
              <h2 className="text-sm font-semibold text-text-primary truncate max-w-[200px]">
                Log: {habit.name}
              </h2>
              <p className="text-[10px] text-text-tertiary">
                {habit.type === 'positive' ? 'Goal:' : 'Limit:'} {habit.target} per {habit.frequency}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-transparent hover:border-border transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {/* Date Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              Log Date
            </label>
            <input
              type="date"
              value={date}
              onClick={(e) => {
                try {
                  // Programmatically trigger native date picker popup instantly
                  (e.target as any).showPicker();
                } catch (err) {
                  // Fallback for older browsers
                }
              }}
              onChange={(e) => setDate(e.target.value)}
              className="w-full max-w-[200px] px-4 py-2.5 bg-surface-2/80 border border-border text-base md:text-sm font-semibold text-text-primary rounded-xl focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all cursor-pointer [color-scheme:dark] shadow-xs"
            />
          </div>

          {/* Remarks Input */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider block">
                Log Remarks / Memo
              </label>
              <div className="flex bg-surface-3 rounded-lg p-1 border border-border/50 items-center">
                <button
                  type="button"
                  onClick={() => setRemark('')}
                  title="Clear Memo"
                  className="px-2 py-1 text-text-tertiary hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-border/50 mx-1" />
                <button
                  type="button"
                  onClick={() => setPreviewMode(false)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${!previewMode ? 'bg-surface-1 text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode(true)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${previewMode ? 'bg-surface-1 text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  Preview
                </button>
              </div>
            </div>
            
            {previewMode ? (
              <div className="w-full min-h-[300px] overflow-y-auto px-4 py-2.5 bg-surface-2 border border-border text-sm text-text-primary rounded-xl prose prose-sm max-w-none prose-headings:font-bold prose-a:text-accent prose-p:leading-relaxed shadow-inner">
                {remark.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {remark}
                  </ReactMarkdown>
                ) : (
                  <span className="text-text-tertiary italic">Nothing to preview.</span>
                )}
              </div>
            ) : (
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="e.g. Done early morning, skipped due to muscle soreness. Markdown is supported (*italic*, **bold**)."
                rows={3}
                className="w-full px-4 py-2.5 bg-surface-2 border border-border text-base md:text-sm text-text-primary rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none leading-relaxed"
              />
            )}
          </div>

          {/* Selector UI based on Target */}
          {!previewMode && (
            isInactiveDay ? (
            <div className="flex flex-col items-center justify-center py-8 bg-surface-2/40 border border-border/40 rounded-2xl w-full px-4 text-center">
              <span className="text-xl mb-2">🚫</span>
              <p className="text-sm font-semibold text-text-primary">Inactive Day</p>
              <p className="text-[11px] text-text-tertiary mt-1">This habit is not active for this day of the week.</p>
            </div>
          ) : isTarget1Daily ? (
            <div className="flex flex-col items-center justify-center py-4 bg-surface-2/40 border border-border/40 rounded-2xl w-full px-4">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Log Status State
              </span>

              <div className="grid grid-cols-4 gap-2 w-full">
                {[
                  { label: 'Unset', symbol: '?', val: -2, color: 'border-border bg-surface-3 text-text-secondary ring-text-secondary/50' },
                  { label: 'Complete', symbol: '✔', val: 1, color: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400 ring-emerald-500' },
                  { label: 'Failed', symbol: '✘', val: 0, color: 'border-rose-500/35 bg-rose-500/10 text-rose-400 ring-rose-500' },
                  { label: 'Skip', symbol: '-', val: -1, color: 'border-border bg-surface-3 text-text-primary ring-border' },
                ].map((opt) => {
                  const isActive = value === opt.val;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setValue(opt.val)}
                      disabled={loading}
                      className={`h-16 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 ${isActive
                          ? `${opt.color} ring-1 ring-offset-2 ring-offset-surface-1`
                          : 'border-border bg-surface-2 text-text-tertiary hover:text-text-primary hover:border-surface-4'
                        }`}
                    >
                      <span className="text-xl font-bold font-mono leading-none">{opt.symbol}</span>
                      <span className="text-[8px] mt-1.5 font-bold uppercase tracking-wider leading-none">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Status explanation text */}
              {!loading && (
                <span className={`text-[10px] mt-4 font-semibold ${value === 1
                    ? 'text-emerald-400'
                    : value === -1
                      ? 'text-text-secondary'
                      : value === 0
                        ? 'text-rose-400'
                        : 'text-text-tertiary'
                  }`}>
                  {value === 1
                    ? '🎉 Goal achieved for this date!'
                    : value === -1
                      ? '➖ Day skipped (ignored in health average)'
                      : value === 0
                        ? '✘ Explicitly marked as failed / skipped (0% score)'
                        : '❓ Not logged yet (default unset)'
                  }
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 bg-surface-2/40 border border-border/40 rounded-2xl w-full px-4">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Logged Amount
              </span>

              {/* Custom step adjusting buttons */}
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={(value <= 0 && value >= -1) || loading}
                  className="w-12 h-12 rounded-xl flex items-center justify-center border border-border bg-surface-2 text-text-primary hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-surface-2 active:scale-95 transition-all cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <div className="w-20 text-center">
                  {loading ? (
                    <span className="text-2xl font-bold text-text-secondary animate-pulse">...</span>
                  ) : value === -1 || value === -2 ? (
                    <span
                      onClick={() => setValue(0)}
                      className="text-3xl font-extrabold text-text-primary font-mono cursor-pointer hover:text-accent select-none"
                    >
                      {value === -2 ? '?' : '-'}
                    </span>
                  ) : (
                    <input
                      type="number"
                      value={value}
                      step="any"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setValue(isNaN(v) ? 0 : Math.max(0, v));
                      }}
                      className="w-full text-center text-3xl font-extrabold text-text-primary font-mono bg-transparent border-b border-dashed border-border/30 focus:border-accent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={loading}
                  className="w-12 h-12 rounded-xl flex items-center justify-center border border-border bg-surface-2 text-text-primary hover:bg-surface-3 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Inline Skip and Clear controls */}
              <div className="grid grid-cols-2 gap-3 mt-4 w-full max-w-[220px]">
                <button
                  type="button"
                  onClick={() => setValue(-1)}
                  disabled={loading}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-semibold active:scale-95 transition-all cursor-pointer ${value === -1
                      ? 'bg-surface-3 border-border text-text-primary'
                      : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:bg-surface-3'
                    }`}
                >
                  Skip (-)
                </button>
                <button
                  type="button"
                  onClick={() => setValue(-2)}
                  disabled={loading}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-semibold active:scale-95 transition-all cursor-pointer ${value === -2
                      ? 'bg-surface-3 border-border text-text-primary'
                      : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:bg-surface-3'
                    }`}
                >
                  Clear (?)
                </button>
              </div>

              {/* Target comparison hint */}
              {!loading && value >= 0 && (
                <span className={`text-[10px] mt-4 font-semibold ${habit.type === 'positive'
                    ? value >= habit.target
                      ? 'text-emerald-400'
                      : 'text-text-tertiary'
                    : value > habit.target
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}>
                  {habit.type === 'positive'
                    ? value >= habit.target
                      ? '🎉 Goal achieved for this date!'
                      : `${habit.target - value} more needed to hit target`
                    : value > habit.target
                      ? `⚠️ Exceeded limit by ${value - habit.target}`
                      : '✅ Within limit'
                  }
                </span>
              )}
              {!loading && value < 0 && (
                <span className="text-[10px] mt-4 font-semibold text-text-tertiary">
                  {value === -1 ? '➖ Day skipped (ignored in calculations)' : '❓ Unlogged state (default)'}
                </span>
              )}
            </div>
          )
        )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface-1 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-transparent border border-border hover:bg-surface-3 hover:text-text-primary hover:border-surface-4 rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || showSuccess || isInactiveDay}
            className="px-5 py-2 text-sm font-medium text-white bg-accent border border-accent hover:opacity-90 hover:shadow-lg hover:shadow-accent/25 rounded-xl active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Save Log
          </button>
        </div>
      </div>
    </>
  );
}
