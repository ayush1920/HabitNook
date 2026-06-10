import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import type { User, Session } from '@supabase/supabase-js'
import {
  LogOut,
  User as UserIcon,
  Download,
  Upload,
  ShieldCheck,
  Clock,
  KeyRound,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'
import { db } from '../db/database'
import { getPlatform, getInstallInstructions } from '../utils/platform'
import { onSyncStatusChange } from '../db/sync'

interface SettingsProps {
  user: User
  onSignOutOverride?: () => Promise<void>
  theme: 'light' | 'dark' | 'system'
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void
}

export default function Settings({ user, onSignOutOverride, theme, onThemeChange }: SettingsProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [signOutLoading, setSignOutLoading] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => localStorage.getItem('habitloop_last_sync_time'))
  const [logIncrement, setLogIncrement] = useState<number>(() => {
    const saved = localStorage.getItem('habitnook_log_increment')
    return saved ? parseFloat(saved) : 1
  })

  const handleLogIncrementChange = (value: number) => {
    setLogIncrement(value)
    localStorage.setItem('habitnook_log_increment', String(value))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
  }, [])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    return onSyncStatusChange((status) => {
      if (status === 'synced') {
        setLastSyncTime(localStorage.getItem('habitloop_last_sync_time'))
      }
    })
  }, [])

  const handleSignOut = async () => {
    try {
      setSignOutLoading(true)
      setSignOutError(null)
      if (onSignOutOverride) {
        await onSignOutOverride()
      } else {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      }
    } catch (err: any) {
      setSignOutError(err.message || 'Sign out failed.')
      setSignOutLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const habits = await db.habits.toArray()
      const entries = await db.entries.toArray()
      const exportData = {
        version: 1,
        habits,
        entries,
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `habit_loop_backup_${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (err) {
      console.error('Export failed', err)
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const reader = new FileReader()
    reader.readAsText(files[0])
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (parsed.version === 1 && Array.isArray(parsed.habits) && Array.isArray(parsed.entries)) {
          // Import into IndexedDB
          await db.transaction('rw', [db.habits, db.entries], async () => {
            for (const h of parsed.habits) {
              await db.habits.put(h)
            }
            for (const ent of parsed.entries) {
              await db.entries.put(ent)
            }
          })
          setImportStatus(`Imported ${parsed.habits.length} habits and ${parsed.entries.length} entries successfully!`)
        } else {
          setImportStatus('Error: invalid backup file format.')
        }
      } catch {
        setImportStatus('Error: failed to parse JSON.')
      }
      setTimeout(() => setImportStatus(null), 4000)
    }
  }

  // Derived
  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const avatar = user.user_metadata?.avatar_url || null
  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'
  const provider = user.app_metadata?.provider || (user.id === 'local' ? 'guest' : 'unknown')
  const tokenExpires = session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : '—'
  const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—'

  /* Shared interactive button class */
  const btnBase = 'flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97] outline-none focus-visible:ring-1 focus-visible:ring-accent border border-transparent hover:border-border-active'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">

      {/* ── Appearance Section ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">Appearance</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-surface-3 text-xs">
          <div>
            <p className="text-text-primary font-bold text-sm">Theme Mode</p>
            <p className="text-text-secondary mt-1">Select how HabitNook looks on your device.</p>
          </div>
          <div className="flex items-center gap-0.5 bg-surface-2 border border-border/60 p-0.5 rounded-xl self-start sm:self-center">
            {(['light', 'dark', 'system'] as const).map((mode) => {
              const active = theme === mode
              const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor
              const label = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'
              return (
                <button
                  key={mode}
                  onClick={() => onThemeChange(mode)}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer
                    ${active 
                      ? 'bg-accent/10 border border-accent/15 text-accent' 
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-3/80'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Preferences Section ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">Preferences</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-surface-3 text-xs">
          <div>
            <p className="text-text-primary font-bold text-sm">Log Increment Step</p>
            <p className="text-text-secondary mt-1">Determine how much the plus/minus buttons adjust values.</p>
          </div>
          <div className="flex items-center gap-0.5 bg-surface-2 border border-border/60 p-0.5 rounded-xl self-start sm:self-center">
            {([0.1, 0.5, 1, 2, 5] as const).map((step) => {
              const active = logIncrement === step
              return (
                <button
                  key={step}
                  onClick={() => handleLogIncrementChange(step)}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer
                    ${active 
                      ? 'bg-accent/10 border border-accent/15 text-accent' 
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-3/80'
                    }
                  `}
                >
                  <span>{step}</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── App Installation Guide ── */}
      {(() => {
        const platform = getPlatform();
        const inst = getInstallInstructions(platform);
        const formatText = (text: string) => {
          const parts = text.split('**');
          return parts.map((part, index) => {
            return index % 2 === 1 ? <strong key={index}>{part}</strong> : part;
          });
        };
        return (
          <section className="card p-5">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">App Installation Guide</h2>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-surface-3 text-xs">
                <div>
                  <p className="text-text-primary font-bold text-sm">Device Platform</p>
                  <p className="text-text-secondary mt-1">We've customized instructions for your detected platform.</p>
                </div>
                <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent/10 border border-accent/15 text-accent uppercase tracking-wide self-start sm:self-center">
                  {inst.platformName}
                </span>
              </div>

              <div className="bg-surface-2 border border-border rounded-xl p-4 text-xs space-y-2.5 font-medium text-text-primary">
                <p className="font-bold text-accent text-[11px] uppercase tracking-wider">How to Install:</p>
                {inst.steps.map((s) => (
                  <div key={s.step} className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center w-4.5 h-4.5 rounded bg-surface-3 text-[11px] shrink-0 mt-0.5">{s.step}</span>
                    <span className="leading-normal">
                      {formatText(s.text)}
                      {s.badge && (
                        <span className="inline-block px-1.5 py-0.5 bg-surface-3 border border-border/30 rounded text-[9px] font-bold ml-1.5">{s.badge}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Profile Section ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">Profile</h2>

        <div className="flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-14 h-14 rounded-full object-cover border border-border" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-surface-4 flex items-center justify-center text-lg font-bold text-text-secondary border border-border">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold text-text-primary truncate">{displayName}</p>
            <p className="text-xs text-text-secondary truncate">{user.email}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-3">
            <span className="text-text-tertiary">Provider</span>
            <span className="text-text-primary font-medium uppercase tracking-wider text-[10px] bg-surface-4 px-2 py-0.5 rounded">{provider}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-3">
            <span className="text-text-tertiary">Email</span>
            <span className={`font-medium ${user.email_confirmed_at || user.id === 'local' ? 'text-emerald-400' : 'text-warning'}`}>
              {user.email_confirmed_at || user.id === 'local' ? 'Verified' : 'Unverified'}
            </span>
          </div>
        </div>
      </section>

      {/* ── Auth Verification ── */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Session Verification</h2>
          <span className="ml-auto text-[9px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded tracking-wider">LIVE</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-3">
            <KeyRound className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-text-tertiary mb-0.5">User ID</p>
              <p className="text-text-primary font-mono text-[11px] break-all">{user.id}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-3">
            <UserIcon className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-text-tertiary mb-0.5">Auth Provider</p>
              <p className="text-text-primary capitalize font-semibold">{provider}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-3">
            <Clock className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-text-tertiary mb-0.5">Signed In At</p>
              <p className="text-text-primary">{lastSignIn}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-3">
            <Clock className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-text-tertiary mb-0.5">Session Expires</p>
              <p className="text-text-primary">{tokenExpires}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Data Portability ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">Data & Cloud Synchronization</h2>

        {/* Network status */}
        <div className={`p-4 rounded-xl border mb-4 text-xs font-medium space-y-3 ${
          isOnline && user.id !== 'local' ? 'bg-transparent border-border text-emerald-450' : 'bg-transparent border-border text-amber-450'
        }`}>
          <div className="flex items-center gap-2">
            {isOnline && user.id !== 'local' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="font-bold">{isOnline && user.id !== 'local' ? 'Online — synced with Supabase' : 'Offline — storing entries locally'}</span>
          </div>
          
          <div className="flex justify-between items-center text-text-secondary text-[11px]">
            <span>Last Synced Status:</span>
            <span className="font-mono text-text-primary bg-surface-3 px-2 py-0.5 rounded border border-border/20">
              {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never synced'}
            </span>
          </div>
        </div>

        {importStatus && (
          <div className={`p-2.5 rounded-lg mb-3 text-xs border ${
            importStatus.startsWith('Error') ? 'bg-danger/10 border-danger/25 text-danger' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          }`}>{importStatus}</div>
        )}
        {exportSuccess && (
          <div className="p-2.5 rounded-lg mb-3 text-xs bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">Exported successfully!</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={async () => {
              const { syncDataWithSupabase } = await import('../db/sync');
              setImportStatus('Syncing with Supabase...');
              const res = await syncDataWithSupabase();
              if (res.success) {
                const now = new Date().toISOString();
                localStorage.setItem('habitloop_last_sync_time', now);
                setLastSyncTime(now);
                setImportStatus('Manual cloud sync completed successfully!');
                setTimeout(() => setImportStatus(null), 3000);
              } else {
                setImportStatus(`Error during manual sync: ${res.error}`);
              }
            }}
            className={`${btnBase} bg-surface-3 border border-border hover:bg-surface-4 hover:border-border-active hover:shadow-lg text-text-primary shadow-sm`}
          >
            <Clock className="w-4 h-4 text-accent" />
            Sync Now
          </button>

          <button
            onClick={handleExport}
            className={`${btnBase} bg-surface-3 border border-border hover:bg-surface-4 hover:border-border-active hover:shadow-lg text-text-primary shadow-sm`}
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>

          <label className={`${btnBase} border border-border bg-transparent hover:bg-surface-3 hover:border-border-active hover:shadow-lg text-text-secondary hover:text-text-primary cursor-pointer shadow-sm`}>
            <Upload className="w-4 h-4" />
            Import JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </section>

      {/* ── Sign Out (standalone full-width) ── */}
      {signOutError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg text-xs bg-danger/10 text-danger border border-danger/20">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{signOutError}</span>
        </div>
      )}

      <button
        onClick={handleSignOut}
        disabled={signOutLoading}
        className={`${btnBase} w-full py-3 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 hover:shadow-lg text-rose-400 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {signOutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        <span>{signOutLoading ? 'Signing out…' : 'Sign Out'}</span>
      </button>
    </div>
  )
}
