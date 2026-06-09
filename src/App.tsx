import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'
import Login from './components/Login'
import Layout from './components/Layout'
import type { Page } from './components/Layout'
import Home from './components/Home'
import Settings from './components/Settings'
import Trends from './components/Trends'
import HabitDetail from './components/HabitDetail'
import AddHabitSheet from './components/AddHabitSheet'
import LogEntrySheet from './components/LogEntrySheet'
import HabitJournal from './components/HabitJournal'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { Habit } from './db/database'
import { addHabit, updateHabit, deleteHabit } from './db/habits'
import { logEntry } from './db/entries'
import { initializeAutomatedSync, syncDataWithSupabase, registerConflictNotifier } from './db/sync'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null)
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [isLogSheetOpen, setIsLogSheetOpen] = useState(false)
  const [logInitialDate, setLogInitialDate] = useState<string | undefined>(undefined)
  const [habitToEdit, setHabitToEdit] = useState<Habit | undefined>(undefined)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // System-level sync conflict alerts modal state
  const [syncConflictMessage, setSyncConflictMessage] = useState<string | null>(null)

  // Initialize offline sync channels on initial mount
  useEffect(() => {
    initializeAutomatedSync()
  }, [])

  // Theme support
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('habitnook_theme')
    return (saved as 'light' | 'dark' | 'system') || 'system'
  })

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.add('light')
    }
    localStorage.setItem('habitnook_theme', theme)
  }, [theme])

  // Listen for authentication events
  useEffect(() => {
    // Check if there is an offline guest session stored in localStorage
    const savedGuest = localStorage.getItem('habitnook_guest_user')
    if (savedGuest) {
      setUser(JSON.parse(savedGuest))
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('[HabitNook] getSession error:', error.message)
      if (session) {
        setUser(session.user)
        if (window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        // Force an initial background sync when session is established on returning users
        syncDataWithSupabase().then(() => setRefreshTrigger(prev => prev + 1));
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // If we are in guest mode, don't let Supabase null session override it immediately
      const currentGuest = localStorage.getItem('habitnook_guest_user')
      if (currentGuest) {
        setUser(JSON.parse(currentGuest))
      } else {
        const u = session?.user ?? null;
        setUser(u)
        if (u) {
          // Sync on auth stage change transitions
          syncDataWithSupabase().then(() => setRefreshTrigger(prev => prev + 1));
        }
        if (session && window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
      setLoading(false)
    })

    // Register premium overlay conflict notifier handler on launch
    registerConflictNotifier(async (msg) => {
      setSyncConflictMessage(msg);
    });

    return () => subscription.unsubscribe()
  }, [])

  // Guest sign in handler
  const handleGuestSignIn = () => {
    const guestUser = {
      id: 'local',
      email: 'guest@habitnook.local',
      user_metadata: {
        full_name: 'Guest User',
      }
    } as any
    localStorage.setItem('habitnook_guest_user', JSON.stringify(guestUser))
    setUser(guestUser)
  }

  // Handle custom sign out that also clears local storage guest sessions
  const handleSignOut = async () => {
    localStorage.removeItem('habitnook_guest_user')
    await supabase.auth.signOut()
    setUser(null)
    setCurrentPage('home')
  }

  // CRUD handlers
  const handleSaveHabit = async (habitData: {
    name: string;
    description?: string;
    type: 'positive' | 'limiting';
    frequency: 'daily' | 'weekly' | 'monthly';
    target: number;
    passPercentage?: number;
    icon: string;
    color: string;
    weekdays?: number[];
  }) => {
    try {
      const activeUserId = user?.id || 'local'
      if (habitToEdit) {
        await updateHabit(habitToEdit.id, habitData)
        if (selectedHabit && selectedHabit.id === habitToEdit.id) {
          setSelectedHabit({ ...selectedHabit, ...habitData })
        }
      } else {
        await addHabit({
          ...habitData,
          userId: activeUserId,
        })
      }
      setRefreshTrigger(prev => prev + 1)
      setIsAddSheetOpen(false)
      setHabitToEdit(undefined)
    } catch (err) {
      console.error('Error saving habit:', err)
    }
  }

  const handleDeleteHabit = async (id: string) => {
    try {
      await deleteHabit(id)
      setSelectedHabit(null)
      setCurrentPage('home')
      setRefreshTrigger(prev => prev + 1)
    } catch (err) {
      console.error('Error deleting habit:', err)
    }
  }

  const handleLogEntry = async (habitId: string, date: string, value: number, remark?: string) => {
    try {
      await logEntry(habitId, date, value, remark)
      setRefreshTrigger(prev => prev + 1)
      
      // If selected habit is active, fetch its updated details
      if (selectedHabit && selectedHabit.id === habitId) {
        setSelectedHabit({ ...selectedHabit })
      }
    } catch (err) {
      console.error('Error logging entry:', err)
    }
  }

  // Loading state spinner
  if (loading) {
    return (
      <div className="min-h-dvh bg-surface-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-lg bg-accent/20 animate-ping" />
            <div className="relative w-10 h-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-accent" />
            </div>
          </div>
          <p className="text-xs text-text-tertiary animate-pulse">Loading…</p>
        </div>
      </div>
    )
  }

  // Unauthenticated view
  if (!user) {
    return <Login onGuestSignIn={handleGuestSignIn} />
  }

  // Router switch
  const renderPage = () => {
    switch (currentPage) {
      case 'settings':
        return <Settings user={user} onSignOutOverride={handleSignOut} theme={theme} onThemeChange={setTheme} />
      case 'trends':
        return (
          <Trends 
            user={user} 
            onSelectHabit={(h) => {
              setSelectedHabit(h)
              setCurrentPage('habit-detail')
            }}
            refreshTrigger={refreshTrigger}
          />
        )
      case 'habit-detail':
        if (!selectedHabit) {
          setCurrentPage('home')
          return null
        }
        return (
          <HabitDetail 
            habit={selectedHabit} 
            onBack={() => {
              setCurrentPage('home')
            }} 
            onEdit={(h) => {
              setHabitToEdit(h)
              setIsAddSheetOpen(true)
            }} 
            onDelete={handleDeleteHabit} 
            onLogClick={(dateStr?: string) => {
              if (dateStr) {
                setLogInitialDate(dateStr)
              } else {
                setLogInitialDate(undefined)
              }
              setIsLogSheetOpen(true)
            }}
            onOpenJournal={() => setCurrentPage('journal')}
          />
        )
      case 'journal':
        return selectedHabit ? (
          <HabitJournal 
            habit={selectedHabit}
            onBack={() => setCurrentPage('habit-detail')}
          />
        ) : (
          <div className="p-8 text-center text-text-tertiary">No habit selected for journal view.</div>
        )
      case 'home':
      default:
        return (
          <Home 
            user={user} 
            onSelectHabit={(h) => {
              setSelectedHabit(h)
              setCurrentPage('habit-detail')
            }} 
            onAddHabitClick={() => {
              setHabitToEdit(undefined)
              setIsAddSheetOpen(true)
            }} 
            onLogHabitClick={(habit, dateStr) => {
              setSelectedHabit(habit)
              setLogInitialDate(dateStr)
              setIsLogSheetOpen(true)
            }}
            refreshTrigger={refreshTrigger}
          />
        )
    }
  }

  return (
    <div className="min-h-dvh bg-surface-0 text-text-primary">
      <Layout user={user} currentPage={currentPage} onNavigate={setCurrentPage} theme={theme} onThemeChange={setTheme}>
        {renderPage()}
      </Layout>

      {/* Sheet forms */}
      <AddHabitSheet
        isOpen={isAddSheetOpen}
        onClose={() => {
          setIsAddSheetOpen(false)
          setHabitToEdit(undefined)
        }}
        onSave={handleSaveHabit}
        habitToEdit={habitToEdit}
      />

      <LogEntrySheet
        isOpen={isLogSheetOpen}
        onClose={() => {
          setIsLogSheetOpen(false)
          setLogInitialDate(undefined)
        }}
        habit={selectedHabit}
        initialDate={logInitialDate}
        onSave={handleLogEntry}
      />

      {/* ── Sync Conflict Overlay Modal ── */}
      {syncConflictMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-surface-1 border border-border rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-text-primary">Cloud Sync Reconcilation</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed bg-surface-2 p-3 rounded-lg border border-border/40 select-text">
              {syncConflictMessage}
            </p>
            <div className="flex items-center justify-end pt-2">
              <button
                onClick={() => {
                  setSyncConflictMessage(null)
                  setRefreshTrigger(prev => prev + 1)
                  // If selected habit is active, force reload it from local Dexie copies
                  if (selectedHabit) {
                    setSelectedHabit(null)
                    setCurrentPage('home')
                  }
                }}
                className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-white bg-accent hover:opacity-90 rounded-xl active:scale-95 transition-all cursor-pointer text-center"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
