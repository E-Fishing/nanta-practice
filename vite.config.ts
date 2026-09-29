/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Claude desktop app assigns a free port through PORT when it starts the dev server
// (autoPort in .claude/launch.json). Without PORT, Vite's default 5173 is used.
const port = process.env.PORT ? Number(process.env.PORT) : 5173

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from https://<user>.github.io/nanta-practice/. Assets and the
  // pieces JSON (fetched from import.meta.env.BASE_URL) load from that subpath; the hash router
  // keeps every route on the same page. The dev server uses it too: / redirects to /nanta-practice/.
  base: '/nanta-practice/',
  server: {
    // 127.0.0.1 rather than localhost: on this machine localhost has resolved inconsistently.
    host: '127.0.0.1',
    port,
    // An assigned port must be honoured exactly; the default may drift if 5173 is busy.
    strictPort: Boolean(process.env.PORT),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
