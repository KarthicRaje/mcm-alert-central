// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      srcDir: 'public',
      filename: 'service-worker.js',
      includeAssets: ['favicon.ico', 'mcm-logo-192.png', 'mcm-logo-512.png'],
      manifest: {
        name: 'MCM Alerts',
        short_name: 'MCM Alerts',
        description: 'Push notification system',
        theme_color: '#1e293b',
        background_color: '#1e293b',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/mcm-logo-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/mcm-logo-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      injectManifest: {
        swSrc: 'public/service-worker.js',
        swDest: 'dist/service-worker.js',
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg}'
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
