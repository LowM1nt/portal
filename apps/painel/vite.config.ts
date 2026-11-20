import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // o teste de contrato lê ../../docs/eventos.md
  server: { fs: { allow: ['../..'] } },
  test: {
    environment: 'jsdom',
    css: { include: /.+/ },
    setupFiles: ['./src/test/setup.ts'],
  },
})
