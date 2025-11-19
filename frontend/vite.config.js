import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ALEFY',
        short_name: 'ALEFY',
        description: 'Sistema di Streaming Musicale Personale',
        theme_color: '#1db954',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: [
      'alevale.iliadboxos.it',
      'localhost',
      '.iliadboxos.it'
    ],
    proxy: {
      '^/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});

