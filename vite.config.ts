import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'MCM Alerts',
        short_name: 'MCM Alerts',
        theme_color: '#1e293b',
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
        swSrc: 'src/sw.ts',
        swDest: 'dist/sw.js',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ]
})
