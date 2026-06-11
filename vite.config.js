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
});
