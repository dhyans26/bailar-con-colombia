import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). ' +
    'Leaderboard reads/writes will fail until they are set in the repo-root .env.'
  )
}

export const supabase = createClient(url ?? '', key ?? '')

export const LEADERBOARD_TABLE = 'salsa_leaderboard'
