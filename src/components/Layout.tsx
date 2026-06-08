import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Home, Settings, TrendingUp, Sun, Moon, Monitor, Download, X } from 'lucide-react'

export type Page = 'home' | 'settings' | 'trends' | 'habit-detail'

interface LayoutProps {
  user: User
  children: React.ReactNode
  currentPage: Page
  onNavigate: (page: Page) => void
  theme: 'light' | 'dark' | 'system'
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void
}

const NAV_ITEMS: { id: Exclude<Page, 'habit-detail'>; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Layout({ user, children, currentPage, onNavigate, theme, onThemeChange }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showIOSInstallTip, setShowIOSInstallTip] = useState(false)

  useEffect(() => {
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);
    // Detect standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    // Check if user already dismissed it
    const dismissed = localStorage.getItem('habitnook_ios_prompt_dismissed');

    if (isIOS && !isStandalone && !dismissed) {
      setShowIOSInstallTip(true);
    }
  }, []);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setDeferredPrompt(null);
    }
  };

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    if (!sidebarOpen) return
    const handleClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false)
      }
    }
    // Delay listener so the hamburger click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [sidebarOpen])

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const avatar = user.user_metadata?.avatar_url || null
  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'

  const handleNav = (page: Page) => {
    onNavigate(page)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-0">

      {/* ── Sidebar (desktop only) ── */}
      <aside
        className="
          hidden md:flex shrink-0 w-64 flex-col h-full
          bg-surface-1 border-r border-border
        "
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-3 px-5 py-4.5 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 shrink-0">
            <img src="/favicon.svg" alt="HabitNook Logo" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-base text-text-primary tracking-tight">HabitNook</span>

        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-none">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold
                  transition-all duration-200
                  ${active
                    ? 'bg-accent/10 text-accent border border-accent/15'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer — user chip */}
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={() => handleNav('settings')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors"
          >
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="w-7 h-7 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-surface-4 flex items-center justify-center text-[10px] font-bold text-text-secondary">
                {initials}
              </div>
            )}
            <div className="text-left min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{displayName}</p>
              <p className="text-xs text-text-tertiary truncate">{user.email}</p>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

        {/* Top bar (page title + theme) */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-4.5 bg-surface-0/90 backdrop-blur-xl border-b border-border shadow-sm md:px-8">
          <div className="flex items-center gap-3 md:gap-4">
            <img src="/favicon.svg" alt="Logo" className="w-7 h-7 object-contain md:hidden" />
            <h1 className="text-lg font-bold text-text-primary capitalize tracking-tight">
              {currentPage === 'home' ? 'HabitNook' : currentPage === 'habit-detail' ? 'Habit Detail' : currentPage}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-accent hover:bg-accent/90 rounded-lg shadow-sm transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Install App</span>
                <span className="sm:hidden">Install</span>
              </button>
            )}

            {/* Theme Selector Segment Control */}
            <div className="flex items-center gap-0.5 bg-surface-3 border border-border/80 p-0.5 rounded-xl">
            {(['light', 'dark', 'system'] as const).map((mode) => {
              const active = theme === mode
              const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor
              const title = mode === 'light' ? 'Light Theme' : mode === 'dark' ? 'Dark Theme' : 'System Theme'
              return (
                <button
                  key={mode}
                  onClick={() => onThemeChange(mode)}
                  className={`
                    p-1.5 rounded-lg transition-all relative group cursor-pointer
                    ${active 
                      ? 'bg-accent/10 text-accent border border-accent/10 font-bold' 
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2/60'
                    }
                  `}
                  title={title}
                  aria-label={title}
                >
                  <Icon className="w-4 h-4" />
                </button>
              )
            })}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Navigation Pill ── */}
      <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-1/90 backdrop-blur-xl border border-border shadow-2xl rounded-[32px] px-3 py-2 flex items-center gap-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 relative
                ${active
                  ? 'bg-accent text-white shadow-lg shadow-accent/40 scale-105 -translate-y-1'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-3 active:scale-95'
                }
              `}
              aria-label={item.label}
            >
              <Icon className="w-5 h-5" />
              {active && (
                <span className="absolute -bottom-1.5 w-1 h-1 rounded-full bg-accent animate-pulse" />
              )}
            </button>
          )
        })}
        {/* Mobile User/Settings fallback just in case, though settings is an item */}
      </nav>
      {/* iOS Safari PWA Install Helper Toast */}
      {showIOSInstallTip && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-xs bg-surface-1/95 backdrop-blur-md border border-accent/20 rounded-2xl shadow-2xl p-4.5 animate-fade-in flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-accent font-extrabold text-xs">
              <span className="text-sm">✨</span>
              <span>Install HabitNook</span>
            </div>
            <button
              onClick={() => {
                setShowIOSInstallTip(false);
                localStorage.setItem('habitnook_ios_prompt_dismissed', 'true');
              }}
              className="text-text-tertiary hover:text-text-primary p-0.5 rounded-lg hover:bg-surface-3 transition-all cursor-pointer"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Install this app on your iPhone for a full-screen, offline-enabled app experience:
          </p>
          <div className="bg-surface-2/60 border border-border/40 rounded-xl p-3 text-[11px] space-y-2 font-medium text-text-primary">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded bg-surface-3 text-[10px]">1</span>
              <span>Tap the **Share** button in Safari's toolbar (represented by the <span className="inline-block px-1.5 py-0.5 bg-surface-3 border border-border/30 rounded text-[9px] font-bold">📤 Share</span> icon)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded bg-surface-3 text-[10px]">2</span>
              <span>Scroll down and select <span className="inline-block px-1.5 py-0.5 bg-surface-3 border border-border/30 rounded text-[9px] font-bold">➕ Add to Home Screen</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
