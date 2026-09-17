import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA sa servuje z lokálnej služby (service/), nie z Vite dev servera.
// Po zmene: npm run build → služba servuje app/dist.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'N-portal',
        short_name: 'N-portal',
        description: 'Dotykový pracovný panel NOXUN',
        lang: 'sk',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0f1218',
        theme_color: '#0f1218',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // stav ide cez WebSocket, cache len pre shell aplikácie
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/mock/, /^\/led/],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['**/mock*', '**/led*'],
      },
    }),
  ],
  // Vývojový server (npm run dev, port 5173) preposiela stav aj povely bežiacej službe na 8790,
  // takže sa dá testovať s reálnymi dátami bez zásahu do produkčnej služby.
  // Otvoriť: http://localhost:5173/?t=<token z ~/.n-portal/service/config.json>
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8790', ws: true },
      '/api': { target: 'http://localhost:8790' },
    },
  },
});
