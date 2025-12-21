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
});
