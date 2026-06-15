import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        hmr: true,
        watch: {
            usePolling: true, // Better file watching on some systems
        },
    },
    // Force full page reload for Three.js applications
    // Three.js doesn't support HMR well, so we reload the page on any change
    optimizeDeps: {
        exclude: ['three'],
    },
    build: {
        rollupOptions: {
            output: {
                // Split the three.js library into its own chunk: keeps the app
                // entry below Rollup's 500 kB single-chunk warning line and
                // lets the (rarely changing) library cache independently.
                manualChunks: {
                    three: ['three'],
                },
            },
        },
        // The dedicated three chunk is ~505 kB minified (~125 kB gzip) — a
        // single library that cannot be subdivided further. Lift the warning
        // line just above it so the warning stays meaningful for APP chunks.
        chunkSizeWarningLimit: 550,
    },
    plugins: [
        VitePWA({
            // Silent update: the new service worker takes over on the next
            // visit so a live session is never interrupted mid-play.
            registerType: 'autoUpdate',
            // Non-imported static assets that must be precached explicitly.
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/favicon-32.png'],
            manifest: {
                name: '1-Bit Chimera Void',
                short_name: '1bit',
                description: '基于 Three.js 的 1-bit 抖动渲染交互式 3D 体验',
                lang: 'zh',
                // Stable app identity, decoupled from start_url so a future
                // start_url change can't fork the installed app's identity.
                id: '/',
                display: 'fullscreen',
                background_color: '#000000',
                theme_color: '#000000',
                start_url: '/',
                scope: '/',
                icons: [
                    {
                        src: 'icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: 'icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: 'icons/icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // Precache every shipped asset class, including the ~505 kB
                // three chunk (< 2 MiB default cap) so the whole experience
                // works fully offline.
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
            },
        }),
    ],
});
