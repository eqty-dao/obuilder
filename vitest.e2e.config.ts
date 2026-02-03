import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.e2e-spec.ts'],
        exclude: ['node_modules', 'dist', 'ownables'],
        testTimeout: 30000, // E2E tests need more time
        hookTimeout: 30000,
        // Sequential execution for e2e tests to avoid port conflicts
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        // NestJS compatibility
        alias: {
            '@/': new URL('./src/', import.meta.url).pathname,
            'src/': new URL('./src/', import.meta.url).pathname,
        },
    },
});
