import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// App version shown in the UI (side navigation footer): `version` from
// package.json — bump it with `npm version patch|minor|major` — plus the short
// git commit, so a screenshot tells exactly which build a server is running.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
let commit = '';
try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
} catch {
    // building outside a git checkout — show the version alone
}

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.jsx',
            refresh: true,
        }),
        react(),
    ],
    define: {
        __APP_VERSION__: JSON.stringify(version),
        __APP_COMMIT__: JSON.stringify(commit),
    },
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
