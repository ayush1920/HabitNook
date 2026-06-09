import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import type { Habit } from '../db/database';

interface AddHabitSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (habitData: {
    name: string;
    description?: string;
    type: 'positive' | 'limiting';
    frequency: 'daily' | 'weekly' | 'monthly';
    target: number;
    passPercentage?: number;
    icon: string;
    color: string;
    weekdays?: number[];
  }) => void;
  habitToEdit?: Habit;
}

const PRESET_COLORS = [
  'var(--habit-color-1)',
  'var(--habit-color-2)',
  'var(--habit-color-3)',
  'var(--habit-color-4)',
  'var(--habit-color-5)',
  'var(--habit-color-6)',
  'var(--habit-color-7)',
  'var(--habit-color-8)',
];

const PRESET_EMOJIS = [
  '💪', '🏃', '🧘', '🚶', '😴', '🥗', '💧', '🥛', '📖', '📚', '🧠', '✍️',
  '💻', '📓', '📱', '🎮', '🚭', '🍺', '☕', '🧁', '🍕', '🍔', '💸', '💰',
  '⏰', '⌚', '🧼', '🧹', '🌱', '🎨', '🎸', '🗣️', '🚗', '💊', '🍎', '🤝',
  '📺', '🍿', '🛍️', '🛌', '🏋️', '🚴', '🏊', '🎯', '🚀', '🔥', '✨', '🏆'
];

export default function AddHabitSheet({ isOpen, onClose, onSave, habitToEdit }: AddHabitSheetProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'positive' | 'limiting'>('positive');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [target, setTarget] = useState<number | ''>(1);
  const [passPercentage, setPassPercentage] = useState<number>(100);
  const [icon, setIcon] = useState('💪');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [error, setError] = useState('');
  const [shouldRender, setShouldRender] = useState(false);
  const [animateActive, setAnimateActive] = useState(false);

  // References and drag tracking for the smooth horizontal emoji scrollbar
  const emojiContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const handleEmojiWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (emojiContainerRef.current) {
      emojiContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!emojiContainerRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - emojiContainerRef.current.offsetLeft;
    scrollLeftRef.current = emojiContainerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !emojiContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - emojiContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    emojiContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  // Sync transition and mount cycles
  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]);

  // Populate form if editing
  useEffect(() => {
    if (habitToEdit) {
      setName(habitToEdit.name);
      setDescription(habitToEdit.description || '');
      setType(habitToEdit.type);
      setFrequency(habitToEdit.frequency);
      setTarget(habitToEdit.target);
      setPassPercentage(habitToEdit.passPercentage ?? 100);
      setIcon(habitToEdit.icon || '💪');
      setColor(habitToEdit.color || PRESET_COLORS[0]);
      setWeekdays(habitToEdit.weekdays || [1, 2, 3, 4, 5, 6, 0]);
    } else {
      // Reset form ONLY when opening a new habit sheet
      if (isOpen) {
        setName('');
        setDescription('');
        setType('positive');
        setFrequency('daily');
        setTarget(1);
        setPassPercentage(100);
        setIcon('💪');
        setColor(PRESET_COLORS[0]);
        setWeekdays([1, 2, 3, 4, 5, 6, 0]);
      }
    }
    setError('');
  }, [habitToEdit, isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a habit name.');
      return;
    }
    if (target === '' || target <= 0) {
      setError(type === 'positive' ? 'Target goal must be greater than 0.' : 'Limit must be greater than 0.');
      return;
    }
    setError('');
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      frequency,
      target,
      passPercentage: passPercentage,
      icon,
      color,
      weekdays: frequency === 'daily' ? weekdays : undefined,
    });
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`sheet-backdrop ${animateActive ? 'active' : ''}`}
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div className={`sheet-container ${animateActive ? 'active' : ''} flex flex-col max-h-[90dvh] sm:max-h-[85dvh] overflow-hidden`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="text-base font-semibold text-text-primary">
              {habitToEdit ? 'Edit Habit' : 'Create New Habit'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-transparent hover:border-border transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name input */}
          <div className="space-y-2">
            <label htmlFor="habit-name" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Habit Name
            </label>
            <input
              id="habit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Cardio, Read Book, Drink Water"
              className="w-full px-4 py-2.5 bg-surface-2 border border-border text-base md:text-sm text-text-primary rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              autoFocus
            />
          </div>
          {/* Description input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="habit-desc" className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Description (Optional)
            </label>
            <textarea
              id="habit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are the details of this habit loop? (e.g. 20 pages max before bed)"
              className="w-full px-4 py-2 bg-surface-2 border border-border text-base md:text-sm text-text-primary rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all min-h-16 resize-none"
            />
          </div>
          {/* Type Selection (Positive vs Limiting) */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block">
              Habit Type
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('positive')}
                className={`p-3.5 rounded-xl border text-left flex flex-col transition-all cursor-pointer ${type === 'positive'
                    ? 'border-accent bg-accent-dim text-accent shadow-xs'
                    : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-surface-4'
                  }`}
              >
                <span className="text-sm font-semibold">Positive</span>
                <span className="text-[10px] opacity-80 mt-1 leading-normal">Build a good habit (e.g. gym, reading)</span>
              </button>
              <button
                type="button"
                onClick={() => setType('limiting')}
                className={`p-3.5 rounded-xl border text-left flex flex-col transition-all cursor-pointer ${type === 'limiting'
                    ? 'border-accent bg-accent-dim text-accent shadow-xs'
                    : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-surface-4'
                  }`}
              >
                <span className="text-sm font-semibold">Limiting</span>
                <span className="text-[10px] opacity-80 mt-1 leading-normal">Break a bad habit (e.g. social media, smoking)</span>
              </button>
            </div>
          </div>

          {/* Frequency & Target */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="habit-frequency" className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Frequency
              </label>
              <select
                id="habit-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-surface-2 border border-border text-base md:text-sm text-text-primary rounded-xl focus:outline-none focus:border-accent transition-all"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="habit-target" className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                {type === 'positive' ? 'Goal Target' : 'Allowed Limit'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="habit-target"
                  type="number"
                  min="1"
                  value={target}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') setTarget('');
                    else setTarget(Math.max(1, parseInt(val) || 1));
                  }}
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border text-base md:text-sm text-text-primary rounded-xl focus:outline-none focus:border-accent transition-all"
                />
                <span className="text-xs text-text-tertiary whitespace-nowrap">
                  {frequency === 'daily' ? '/ day' : frequency === 'weekly' ? '/ week' : '/ month'}
                </span>
              </div>
            </div>
          </div>

          {/* Pass Percentage Threshold for Positive / Limiting Habits Strunks */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label htmlFor="habit-pass" className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                {type === 'positive' ? 'Pass Threshold for Streak' : 'Allowed Ceiling for Streak'}
              </label>
              <span className="text-xs font-extrabold text-accent font-mono">
                {type === 'positive' ? `${passPercentage ?? 100}%` : `${passPercentage ?? 100}%`}
              </span>
            </div>
            
            {type === 'positive' ? (
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                The minimum completion rate required to maintain your active streak. (Currently: log at least <strong className="text-text-primary font-mono">{Math.ceil((Number(target) || 1) * ((passPercentage ?? 100) / 100))}</strong> to keep streak valid).
              </p>
            ) : (
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                The allowed limit buffer percentage before breaking streak. E.g., 100% means you must stay exactly under target, 150% allows logging up to <strong className="text-text-primary font-mono">{Math.ceil((Number(target) || 1) * ((passPercentage ?? 100) / 100))}</strong>.
              </p>
            )}

            <input
              id="habit-pass"
              type="range"
              min={type === 'positive' ? "10" : "100"}
              max={type === 'positive' ? "100" : "200"}
              step={type === 'positive' ? "10" : "10"}
              value={passPercentage ?? 100}
              onChange={(e) => setPassPercentage(parseInt(e.target.value))}
              className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>

          {/* Weekday Selection (Only for Daily Habits) */}
          {frequency === 'daily' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block">
                Active Days
              </span>
              <div className="grid grid-cols-7 gap-1 w-full bg-surface-2 p-1 rounded-xl border border-border max-w-70">
                {[
                  { label: 'M', val: 1 },
                  { label: 'T', val: 2 },
                  { label: 'W', val: 3 },
                  { label: 'T', val: 4 },
                  { label: 'F', val: 5 },
                  { label: 'S', val: 6 },
                  { label: 'S', val: 0 },
                ].map((day, idx) => {
                  const isActive = weekdays.includes(day.val);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setWeekdays((prev) => {
                          if (prev.includes(day.val)) {
                            // Don't allow deselecting all days
                            if (prev.length === 1) return prev;
                            return prev.filter((d) => d !== day.val);
                          }
                          return [...prev, day.val];
                        });
                      }}
                      className={`aspect-square w-7.5 rounded-lg flex items-center justify-center text-[10px] font-bold mx-auto transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-accent text-white shadow-xs font-bold' 
                          : 'bg-transparent text-text-tertiary hover:bg-surface-3 hover:text-text-primary'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Icon / Emoji Picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider block">
              Icon / Emoji
            </label>
            <div className="flex gap-3 items-center">
              <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-2xl shrink-0">
                {icon}
              </div>
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  maxLength={4}
                  className="w-16 px-2 py-2 bg-surface-2 border border-border text-base md:text-sm text-center text-text-primary rounded-xl focus:outline-none focus:border-accent transition-all"
                  placeholder="icon"
                />
              </div>
              <span className="text-xs text-text-tertiary">Select preset below:</span>
            </div>

            {/* Smooth Horizontally Scrolled Emoji Preset Bar */}
            <div 
              ref={emojiContainerRef}
              onWheel={handleEmojiWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className="grid grid-flow-col grid-rows-2 gap-2 py-2 px-3 overflow-x-auto overflow-y-hidden scrollbar-none select-none touch-pan-x cursor-grab active:cursor-grabbing snap-x snap-mandatory rounded-xl bg-surface-2/45 border border-border/45 mt-1"
              style={{ 
                scrollBehavior: 'smooth',
                WebkitOverflowScrolling: 'touch',
                height: '92px'
              }}
            >
              {PRESET_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-lg transition-all duration-200 snap-start active:scale-95 cursor-pointer ${
                    icon === emoji 
                      ? 'bg-accent/10 border border-accent/25 text-accent font-bold scale-105 shadow-xs shadow-accent/5' 
                      : 'bg-surface-2 border border-border hover:border-surface-4 text-text-primary hover:scale-105'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color Picker */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block">
              Color Theme
            </span>
            <div className="flex flex-wrap gap-2.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform active:scale-90 relative flex items-center justify-center cursor-pointer border border-black/20 hover:scale-110"
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </form>

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
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-accent border border-accent hover:opacity-90 hover:shadow-lg hover:shadow-accent/25 rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            {habitToEdit ? 'Save Changes' : 'Create Habit'}
          </button>
        </div>
      </div>
    </>
  );
}
