import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify('test'),
        __APP_COMMIT__: JSON.stringify(''),
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['resources/js/**/*.test.ts', 'resources/js/**/*.test.tsx'],
        setupFiles: ['resources/js/test-setup.ts'],
    },
});
