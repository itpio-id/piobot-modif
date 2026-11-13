import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

const appRoot = import.meta.dirname

export default defineConfig({
  root: appRoot,
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: [
      { find: 'react-dom/client', replacement: path.resolve(appRoot, 'node_modules/react-dom/client.js') },
      { find: 'react-dom', replacement: path.resolve(appRoot, 'node_modules/react-dom/index.js') },
      { find: 'react/jsx-runtime', replacement: path.resolve(appRoot, 'node_modules/react/jsx-runtime.js') },
      { find: 'react', replacement: path.resolve(appRoot, 'node_modules/react/index.js') },
    ],
  },
  build: {
    outDir: path.resolve(appRoot, '../assets'),
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(appRoot, '../blueprint.tsx'),
      name: 'PioBotBlueprint',
      formats: ['iife'],
      fileName: () => 'blueprint.js',
      cssFileName: 'blueprint',
    },
  },
})
