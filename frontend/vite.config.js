import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/alchemy-rpc': {
        target: 'https://base-sepolia.g.alchemy.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/alchemy-rpc/, ''),
        secure: false,
      },
      '/public-base-rpc': {
        target: 'https://sepolia.base.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/public-base-rpc/, ''),
        secure: false,
      },
    },
  },
})

