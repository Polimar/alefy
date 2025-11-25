import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      workbox: {
        // Non cachare le richieste API - sempre vai al server
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/.*/i,
            handler: 'NetworkOnly', // Non cachare mai le API
            options: {
              cacheName: 'api-cache',
              // Rimuovo networkTimeoutSeconds perché non è compatibile con NetworkOnly
            },
          },
          // Cacha solo i file statici
          {
            urlPattern: /^https:\/\/.*\/assets\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 anno
              },
            },
          },
        ],
        // Non precache le richieste API
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
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
      'alefy.duckdns.org',
      'localhost',
      '.duckdns.org'
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

