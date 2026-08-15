import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  // .env (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) lives at the repo
  // root, one level up from this Vite project, so both frontend and backend
  // tooling can share it.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
})
