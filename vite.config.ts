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
      srcDir: 'src', // Changed to src for better organization
      filename: 'sw.ts', // Using TypeScript for service worker
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
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/mcm-logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      injectManifest: {
        swSrc: 'src/sw.ts', // Source service worker
        swDest: 'dist/sw.js', // Output service worker
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff2}'
        ],
        maximumFileSizeToCacheInBytes: 5000000, // 5MB
        // Additional manifest transformation
        modifyURLPrefix: {
          'assets/': '/assets/'
        }
      },
      workbox: {
        // Runtime caching for API calls
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/mcm-new\.netlify\.app\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 3600 // 1 hour
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 86400 // 24 hours
              }
            }
          }
        ]
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
  server: {
    port: 5173,
    host: true,
    // Proxy for API in development
    proxy: {
      '/api': {
        target: 'http://localhost:8888', // Netlify dev server
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/.netlify/functions')
      }
    }
  },
  // Ensure environment variables are available
  define: {
    'process.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(process.env.VITE_VAPID_PUBLIC_KEY),
    'process.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
    'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY)
  }
});
