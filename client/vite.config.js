import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Target backend port defaults to 5000 (from backend configuration), configurable via VITE_BACKEND_PORT or BACKEND_PORT
const backendPort = process.env.VITE_BACKEND_PORT || process.env.PORT || '5000'
const backendTarget = process.env.VITE_BACKEND_TARGET || `http://localhost:${backendPort}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
})
