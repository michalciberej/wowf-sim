import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/wowf-sim/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
})
