import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves from /messaging-queue-learning/
export default defineConfig({
  plugins: [react()],
  base: '/messaging-queue-learning/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Increase chunk size limit to accommodate the single large component file
    chunkSizeWarningLimit: 1200,
  },
})
