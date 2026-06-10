import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[HabitNook] Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  )
}

// Validate that the anon key looks like a JWT (starts with "eyJ")
// Common mistake: pasting the service_role key or sb_secret key instead of the anon key
if (supabaseAnonKey && !supabaseAnonKey.startsWith('eyJ')) {
  console.error(
    '[HabitNook] VITE_SUPABASE_ANON_KEY appears to be invalid. ' +
    'The anon key should be a long JWT starting with "eyJ...". ' +
    'Copy it from: Supabase Dashboard → Project Settings → API → Project API keys → anon / public'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Store session in localStorage so it survives page refreshes
    persistSession: true,
    // Detect and handle OAuth redirects automatically (handles #access_token in URL)
    detectSessionInUrl: true,
    // Use PKCE flow for better security with OAuth redirects
    flowType: 'pkce',
  },
})

export default supabase
