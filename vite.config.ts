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
        name: 'MCM Alerts - Real-time Monitoring System',
        short_name: 'MCM Alerts',
        description: 'Real-time monitoring and alert system with push notifications',
        theme_color: '#1e293b',
        background_color: '#1e293b',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/mcm-logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/mcm-logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/mcm-logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'monochrome'
          }
        ],
        categories: ['monitoring', 'productivity', 'utilities'],
        lang: 'en',
        dir: 'ltr',
        prefer_related_applications: false,
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'Open MCM Alerts Dashboard',
            url: '/',
            icons: [{ src: '/mcm-logo-192.png', sizes: '192x192' }]
          }
        ]
      },
      injectManifest: {
        swSrc: 'public/service-worker.js',
        swDest: 'dist/service-worker.js',
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg}'
        ],
        maximumFileSizeToCacheInBytes: 5000000
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash].[ext]',
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js'
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
