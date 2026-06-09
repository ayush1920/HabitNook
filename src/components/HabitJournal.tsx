import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Download, FileText, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import type { Habit, HabitEntry } from '../db/database';
import { getEntriesForHabit } from '../db/entries';

interface HabitJournalProps {
  habit: Habit;
  onBack: () => void;
}

export default function HabitJournal({ habit, onBack }: HabitJournalProps) {
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filterMode, setFilterMode] = useState<'all' | 'week' | 'day'>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [habit.id]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const allEntries = await getEntriesForHabit(habit.id);
      // Only keep entries that actually have a remark
      const withRemarks = allEntries
        .filter(e => e.remark && e.remark.trim() !== '')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(withRemarks);
    } catch (err) {
      console.error('Error loading journal entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (entries.length === 0) return;

    let mdContent = `# Journal: ${habit.name}\n\n`;
    mdContent += `*Exported on ${format(new Date(), 'MMM d, yyyy')}*\n\n---\n\n`;

    entries.forEach(entry => {
      mdContent += `## ${format(new Date(entry.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}\n\n`;
      mdContent += `${entry.remark}\n\n`;
    });

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${habit.name.replace(/\s+/g, '_')}_Journal.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredEntries = entries.filter(e => {
    if (filterMode === 'all') return true;
    const eDate = new Date(e.date + 'T00:00:00');
    if (filterMode === 'day') {
      return format(eDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
    }
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return isWithinInterval(eDate, { start, end });
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 border border-transparent hover:border-border transition-all active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight">
              {habit.icon && <span className="mr-2">{habit.icon}</span>}
              {habit.name} Journal
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-text-tertiary uppercase tracking-wider mt-1">
              {entries.length} logged memo{entries.length !== 1 && 's'}
            </p>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={entries.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl font-bold text-sm hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 border border-accent/20"
        >
          <Download className="w-4 h-4" />
          Export Markdown
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex bg-surface-2 p-1 rounded-lg border border-border/50">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              filterMode === 'all' ? 'bg-surface-1 text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All Memos
          </button>
          <button
            onClick={() => setFilterMode('week')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              filterMode === 'week' ? 'bg-surface-1 text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            By Week
          </button>
        </div>

        {(filterMode === 'week' || filterMode === 'day') && (
          <div className="flex flex-col gap-3 items-center sm:items-end w-full sm:w-auto">
            <div className="flex items-center gap-1.5 bg-surface-2 p-1.5 rounded-xl border border-border/60">
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(selectedDate.getDate() - 7);
                  setSelectedDate(newDate);
                }}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 px-2 min-w-[140px] justify-center text-xs font-bold text-text-primary">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} - {format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
              </div>
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setDate(selectedDate.getDate() + 7);
                  setSelectedDate(newDate);
                }}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-1.5 text-center bg-surface-2/20 p-2 rounded-xl w-full sm:w-auto">
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date(startOfWeek(selectedDate, { weekStartsOn: 1 }));
                d.setDate(d.getDate() + i);
                const dateStr = format(d, 'yyyy-MM-dd');
                const hasMemo = entries.some(m => m.date === dateStr);
                const isSelected = filterMode === 'day' && format(selectedDate, 'yyyy-MM-dd') === dateStr;
                return (
                  <button 
                    key={dateStr} 
                    onClick={() => {
                      setSelectedDate(d);
                      setFilterMode(isSelected ? 'week' : 'day');
                    }}
                    className="flex flex-col items-center gap-1 focus:outline-none group active:scale-95 transition-all"
                  >
                    <span className="text-[10px] text-text-tertiary font-bold group-hover:text-text-primary">{format(d, 'eeeee')}</span>
                    <div 
                      className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-mono border transition-all ${
                        isSelected ? 'bg-accent text-white border-accent shadow-md scale-110' :
                        hasMemo 
                          ? 'bg-[#818cf8]/15 border-[#818cf8]/35 text-[#818cf8] font-bold shadow-xs hover:bg-[#818cf8]/25' 
                          : 'bg-surface-3 border-border/10 text-text-tertiary opacity-45 hover:opacity-80'
                      }`}
                      title={`${dateStr}: ${hasMemo ? 'Memo added' : 'No memo'}`}
                    >
                      <div className="w-full h-full flex items-center justify-center leading-none">
                        {d.getDate()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Journal Feed */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-surface-1/50 border border-border/50 rounded-2xl border-dashed">
          <FileText className="w-12 h-12 text-text-tertiary/50 mb-4" />
          <h3 className="text-base font-bold text-text-secondary">No entries found</h3>
          <p className="text-xs text-text-tertiary mt-2 max-w-sm">
            {filterMode === 'week' || filterMode === 'day'
              ? "There are no memos logged for the selected period."
              : "You haven't added any remarks or memos for this habit yet. Log an entry and add a memo to start your journal!"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredEntries.map(entry => {
            const dateObj = new Date(entry.date + 'T00:00:00');
            return (
              <div key={entry.id} className="bg-surface-1 border border-border rounded-xl shadow-sm overflow-hidden flex flex-col sm:flex-row">
                {/* Date Sidebar */}
                <div className="bg-surface-2 border-b sm:border-b-0 sm:border-r border-border/50 p-4 sm:w-40 flex-shrink-0 flex sm:flex-col items-center sm:items-start justify-between sm:justify-start">
                  <div className="flex flex-col items-start sm:items-center text-center">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">{format(dateObj, 'MMM')}</span>
                    <span className="text-3xl font-extrabold text-text-primary leading-none font-mono my-1">{format(dateObj, 'dd')}</span>
                    <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest">{format(dateObj, 'EEEE')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:mt-4 bg-surface-1 px-2 py-1 rounded border border-border/40">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase">Value:</span>
                    <span className="text-xs font-extrabold font-mono text-accent">{entry.value}</span>
                  </div>
                </div>
                
                {/* Markdown Content */}
                <div className="p-5 flex-1 min-w-0 flex flex-col sm:flex-row gap-4 items-start group">
                  <div className="flex-1 prose prose-sm max-w-none prose-headings:font-bold prose-a:text-accent prose-p:leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {entry.remark || ''}
                    </ReactMarkdown>
                  </div>
                  <button
                    onClick={() => copyToClipboard(entry.id, entry.remark || '')}
                    className="p-2 rounded-lg text-text-tertiary hover:text-accent hover:bg-surface-2 transition-all active:scale-95"
                    title="Copy Markdown"
                  >
                    {copiedId === entry.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
