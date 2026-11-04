import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.jsx',
            refresh: true,
        }),
        react(),
    ],
    esbuild: {
        jsx: 'automatic',
    },
    // Pages are lazy-loaded and each one side-effect imports its own
    // @ui5/webcomponents-icons modules. Without scanning every page up front,
    // Vite discovers those deps only when a page is first opened, re-optimizes
    // mid-session and aborts in-flight imports with "504 Outdated Optimize Dep"
    // (e.g. the redirect to home.tsx after logout fails to load).
    optimizeDeps: {
        entries: ['resources/js/app.tsx', 'resources/js/pages/**/*.tsx'],
    },
    server: {
        host: '0.0.0.0',
        port: 2000,
        cors: true,
        hmr: {
            host: '192.168.9.32',
        },
    },
});
