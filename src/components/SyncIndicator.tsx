import { useEffect, useState } from 'react';
import { CloudOff, CloudDrizzle, CheckCircle2 } from 'lucide-react';
import { onSyncStatusChange } from '../db/sync';
import type { SyncStatus } from '../db/sync';

export default function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    return onSyncStatusChange(setStatus);
  }, []);

  const displayStatus = status === 'idle' ? 'synced' : status;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-2 border border-border/80 rounded-lg shadow-sm transition-all duration-300">
      {displayStatus === 'syncing' && (
        <>
          <CloudDrizzle className="w-4 h-4 text-accent animate-pulse" />
          <span className="text-[10px] font-bold text-accent uppercase tracking-wider hidden sm:inline">Syncing...</span>
        </>
      )}
      {displayStatus === 'synced' && (
        <>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider hidden sm:inline">Synced</span>
        </>
      )}
      {displayStatus === 'error' && (
        <>
          <CloudOff className="w-4 h-4 text-rose-500" />
          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider hidden sm:inline">Offline / Error</span>
        </>
      )}
    </div>
  );
}
