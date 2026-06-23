import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  // Pin an empty PostCSS config inline so the build never inherits a postcss
  // config from a parent directory. This project uses plain CSS with no PostCSS
  // plugins, so the build stays hermetic and reproducible anywhere.
  css: { postcss: {} },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false }
})