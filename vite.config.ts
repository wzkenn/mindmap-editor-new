import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project from /mindmap-editor/.
  // Keep the local development address at http://127.0.0.1:5173/.
  base: command === 'build' ? '/mindmap-editor/' : '/',
  plugins: [react()],
}))
