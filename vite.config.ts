import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isTauriDebug = !!process.env.TAURI_DEBUG

// https://vitejs.dev/config/
// https://tauri.app/v1/guides/getting-started/setup/vite/
export default defineConfig({
  plugins: [react()],

  // Prevent Vite from obscuring Rust errors during `tauri dev`
  clearScreen: false,

  server: {
    port: 3000,
    // Tauri expects a fixed port, fails if not available
    strictPort: true,
    open: !process.env.TAURI_PLATFORM, // don't auto-open a browser tab when launched by Tauri
    watch: {
      // Ignore the Rust project so file changes there don't trigger a Vite reload
      ignored: ['**/src-tauri/**'],
    },
  },

  // Env variables prefixed with TAURI_ are exposed to the frontend
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    outDir: 'dist',
    // Tauri uses Chromium on Windows/Linux and WebKit on macOS
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !isTauriDebug ? 'esbuild' : false,
    sourcemap: isTauriDebug,
  },
})
