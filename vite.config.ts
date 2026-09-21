import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Relative, not absolute. itch.io serves an uploaded build from a
  // subdirectory inside an iframe, so /assets/... resolves to nothing there.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5183 },
  build: {
    target: 'es2020',
    // One file each. A web game's advantage is starting instantly, and a
    // request waterfall is the opposite of that.
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
