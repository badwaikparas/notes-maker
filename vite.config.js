import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'builds/current_release',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        // HTML entry points for React pages
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        popup: resolve(__dirname, 'popup.html'),
        setup: resolve(__dirname, 'setup.html'),
        // Plain JS entry points for extension scripts
        background: resolve(__dirname, 'src/background/background.js'),
        content: resolve(__dirname, 'src/content/content.js'),
      },
      output: {
        // background.js and content.js must be top-level for manifest to reference them
        entryFileNames: (chunk) =>
          ['background', 'content'].includes(chunk.name)
            ? '[name].js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
