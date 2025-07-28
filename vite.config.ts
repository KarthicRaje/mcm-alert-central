import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path'; // Import path module

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
  ],
  // Add resolve.alias configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Add other aliases if needed
    }
  },
  // Optional: Add build configuration
  build: {
    sourcemap: true,
    rollupOptions: {
      // Add any external dependencies that shouldn't be bundled
      external: []
    }
  }
});
