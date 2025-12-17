import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This exposes the app to your local network (Wi-Fi)
    port: 5173,
    watch: {
      usePolling: true // Helps with file changes in some environments
    }
  }
})