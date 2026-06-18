import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes every built asset path relative, so the same /dist works
// whether it is served from a domain root, a GitHub Pages subpath
// (username.github.io/repo/), or inside a Webflow iframe.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false }
})
