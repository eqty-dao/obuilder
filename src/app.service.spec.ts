import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppService } from './app.service';

describe('AppService', () => {
    let service: AppService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AppService();
    });

    describe('Initialization', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should have info property', () => {
            expect(service.info).toBeDefined();
        });
    });

    describe('onModuleInit', () => {
        it('should initialize without error', () => {
            expect(() => service.onModuleInit()).not.toThrow();
        });

        it('should set info from package.json or defaults', () => {
            service.onModuleInit();

            expect(service.info.name).toBeDefined();
            expect(service.info.version).toBeDefined();
            expect(service.info.description).toBeDefined();
            expect(service.info.env).toBeDefined();
        });

        it('should use fallback values if package.json not found', () => {
            // onModuleInit has try-catch, should not throw
            service.onModuleInit();

            // At minimum, name should be set
            expect(service.info.name).toBeTruthy();
        });

        it('should set env from NODE_ENV or default to development', () => {
            service.onModuleInit();

            // Should be either process.env.NODE_ENV or 'development'
            expect(['development', 'test', 'production']).toContain(service.info.env);
        });
    });

    describe('getInfo', () => {
        beforeEach(() => {
            service.onModuleInit();
        });

        it('should return info object', () => {
            const result = service.getInfo('test', 'name');

            expect(result).toBeDefined();
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('version');
            expect(result).toHaveProperty('description');
            expect(result).toHaveProperty('env');
        });

        it('should handle undefined text parameter', () => {
            // Should not throw, just warn
            const result = service.getInfo(undefined as any, 'name');
            expect(result).toBeDefined();
        });

        it('should handle undefined name parameter', () => {
            // Should not throw, just warn
            const result = service.getInfo('text', undefined as any);
            expect(result).toBeDefined();
        });

        it('should handle both parameters undefined', () => {
            const result = service.getInfo(undefined as any, undefined as any);
            expect(result).toBeDefined();
        });

        it('should return same info object regardless of parameters', () => {
            const result1 = service.getInfo('text1', 'name1');
            const result2 = service.getInfo('text2', 'name2');

            expect(result1).toEqual(result2);
        });

        it('should return info with correct structure', () => {
            const result = service.getInfo('hello', 'world');

            expect(typeof result.name).toBe('string');
            expect(typeof result.version).toBe('string');
            expect(typeof result.description).toBe('string');
            expect(typeof result.env).toBe('string');
        });
    });
});
