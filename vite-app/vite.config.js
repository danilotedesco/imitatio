import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages deployment: replace USERNAME/REPO-NAME with your GitHub username and repository name
// For example: if your repo is github.com/danilotedesco/imitatio
// then base should be '/imitatio/'
const BASE_PATH = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base: BASE_PATH,
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser'
  }
})
