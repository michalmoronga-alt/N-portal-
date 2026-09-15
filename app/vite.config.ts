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
  server: { host: true, port: 5173 },
});
