import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
        exclude: ['node_modules', 'dist', 'ownables'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.spec.ts',
                'src/**/*.test.ts',
                'src/**/*.module.ts',
                'src/**/*.dto.ts',
                'src/main.ts',
            ],
            thresholds: {
                statements: 50,
                branches: 70,
                functions: 70,
                lines: 50,
            },
        },
        testTimeout: 10000,
        hookTimeout: 10000,
        // NestJS compatibility
        alias: {
            '@/': new URL('./src/', import.meta.url).pathname,
        },
    },
});
