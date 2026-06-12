import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.VITE_API_URL || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    port: 3000,
    allowedHosts: [
      'vapourish-properly-bridger.ngrok-free.dev',
      '.ngrok-free.dev',
    ],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/images': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
