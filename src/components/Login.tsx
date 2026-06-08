import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { getPlatform, getInstallInstructions, isStandalone } from '../utils/platform'

interface LoginProps {
  onGuestSignIn: () => void;
}

export default function Login({ onGuestSignIn }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [detectedPlatform, setDetectedPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')

  useEffect(() => {
    if (!isStandalone()) {
      setShowInstallPrompt(true)
      setDetectedPlatform(getPlatform())
    }
  }, [])

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const isKeyInvalid = supabaseKey && !supabaseKey.startsWith('eyJ')
  const isUrlMissing = !supabaseUrl || supabaseUrl.includes('your-project-id')

  const handleGoogleSignIn = async () => {
    if (isUrlMissing || isKeyInvalid) {
      setError('Supabase is not configured correctly.')
      setErrorHint(
        isKeyInvalid
          ? 'VITE_SUPABASE_ANON_KEY should be a JWT starting with "eyJ…". Copy the anon/public key from Supabase → Settings → API.'
          : 'VITE_SUPABASE_URL is missing or placeholder. Update your .env file.'
      )
      return
    }

    try {
      setLoading(true)
      setError(null)
      setErrorHint(null)
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      })
      if (authError) throw authError
    } catch (err: any) {
      const msg: string = err.message || 'Sign-in failed.'
      setError(msg)
      if (msg.toLowerCase().includes('provider') || msg.toLowerCase().includes('disabled')) {
        setErrorHint('Enable Google provider in Supabase → Authentication → Providers.')
      } else if (msg.toLowerCase().includes('redirect')) {
        setErrorHint(`Add "${window.location.origin}" to Supabase → Authentication → URL Configuration → Redirect URLs.`)
      }
      setLoading(false)
    }
  }

  const formatText = (text: string) => {
    const parts = text.split('**');
    return parts.map((part, index) => {
      return index % 2 === 1 ? <strong key={index}>{part}</strong> : part;
    });
  };

  return (
    <div className="min-h-dvh bg-surface-0 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-accent-dim mb-4">
            <CheckCircle2 className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight mb-1">HabitNook</h1>
          <p className="text-sm text-text-secondary">Build consistency. Track progress.</p>
        </div>

        {/* Card */}
        <div className="card p-6 space-y-5">

          {/* Key warning */}
          {isKeyInvalid && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning/5 border border-warning/10 text-warning text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Anon key looks wrong</p>
                <p className="mt-0.5 opacity-80">Expected a JWT starting with <code className="bg-surface-3 px-1 rounded text-[11px]">eyJ…</code></p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-danger/5 border border-danger/10 text-danger text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Hint */}
          {errorHint && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent-muted border border-accent/10 text-accent text-xs">
              <ExternalLink className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{errorHint}</p>
            </div>
          )}

          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-text-primary text-surface-0 font-medium text-sm hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{loading ? 'Redirecting…' : 'Continue with Google'}</span>
          </button>

          {/* Guest login */}
          <button
            type="button"
            onClick={onGuestSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border text-text-secondary font-medium text-xs hover:text-text-primary hover:bg-surface-3 transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            Continue Offline (Guest Mode)
          </button>

          <p className="text-center text-[11px] text-text-tertiary">
            By signing in you agree to local-first data storage.
          </p>
        </div>

        {/* Platform-Specific Install Guide */}
        {showInstallPrompt && (() => {
          const inst = getInstallInstructions(detectedPlatform);
          return (
            <div className="card p-5 mt-4 space-y-3 bg-surface-1/90 backdrop-blur-md border border-accent/20">
              <div className="flex items-center gap-2 text-accent font-extrabold text-xs">
                <span className="text-sm">✨</span>
                <span>{inst.title}</span>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Add this web app to your home screen for a full-screen, app-like experience with offline tracking:
              </p>
              <div className="bg-surface-2/60 border border-border/40 rounded-xl p-3 text-[11px] space-y-2 font-medium text-text-primary">
                {inst.steps.map((s) => (
                  <div key={s.step} className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-4 h-4 rounded bg-surface-3 text-[10px] shrink-0 mt-0.5">{s.step}</span>
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
          );
        })()}
      </div>
    </div>
  )
}
