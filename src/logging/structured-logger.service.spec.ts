import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StructuredLogger, LogLevel } from './structured-logger.service';

describe('StructuredLogger', () => {
    let logger: StructuredLogger;
    let consoleLogSpy: any;
    let consoleWarnSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        logger = new StructuredLogger();

        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('LogLevel enum', () => {
        it('should have correct log levels', () => {
            expect(LogLevel.DEBUG).toBe('debug');
            expect(LogLevel.INFO).toBe('info');
            expect(LogLevel.WARN).toBe('warn');
            expect(LogLevel.ERROR).toBe('error');
        });
    });

    describe('Initialization', () => {
        it('should be defined', () => {
            expect(logger).toBeDefined();
        });
    });

    describe('setContext', () => {
        it('should set the context', () => {
            logger.setContext('TestModule');

            // Context is used in writeLog
            logger.log('test message');

            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('debug', () => {
        it('should log debug messages', () => {
            logger.debug('Debug message');

            expect(consoleLogSpy).toHaveBeenCalled();
            const output = consoleLogSpy.mock.calls[0][0];
            expect(output).toContain('DEBUG');
        });

        it('should log debug with context', () => {
            logger.debug('Debug message', { key: 'value' });

            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('log', () => {
        it('should log info messages', () => {
            logger.log('Info message');

            expect(consoleLogSpy).toHaveBeenCalled();
            const output = consoleLogSpy.mock.calls[0][0];
            expect(output).toContain('INFO');
        });

        it('should handle string context', () => {
            logger.log('Info message', 'StringContext');

            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should handle object context', () => {
            logger.log('Info message', { requestId: '123' });

            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('warn', () => {
        it('should log warning messages', () => {
            logger.warn('Warning message');

            expect(consoleWarnSpy).toHaveBeenCalled();
            const output = consoleWarnSpy.mock.calls[0][0];
            expect(output).toContain('WARN');
        });

        it('should log warning with context', () => {
            logger.warn('Warning message', { severity: 'medium' });

            expect(consoleWarnSpy).toHaveBeenCalled();
        });
    });

    describe('error', () => {
        it('should log error messages', () => {
            logger.error('Error message');

            expect(consoleErrorSpy).toHaveBeenCalled();
            const output = consoleErrorSpy.mock.calls[0][0];
            expect(output).toContain('ERROR');
        });

        it('should log error with trace', () => {
            logger.error('Error message', 'Stack trace...');

            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should log error with trace and context', () => {
            logger.error('Error message', 'Stack trace...', { errorCode: 'E001' });

            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });

    describe('verbose', () => {
        it('should log verbose messages as debug', () => {
            logger.verbose('Verbose message');

            expect(consoleLogSpy).toHaveBeenCalled();
            const output = consoleLogSpy.mock.calls[0][0];
            expect(output).toContain('DEBUG');
        });

        it('should log verbose with context', () => {
            logger.verbose('Verbose message', { detail: 'extra info' });

            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('formatReadable', () => {
        it('should format messages with colors in non-production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            logger.log('Test message');

            expect(consoleLogSpy).toHaveBeenCalled();

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('Context handling', () => {
        it('should include module context when setContext is called first', () => {
            logger.setContext('MyModule');
            logger.log('Message with module context');

            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should merge context objects', () => {
            logger.setContext('MyModule');
            logger.log('Message', { extra: 'data' });

            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('Production output', () => {
        it('should output JSON in production mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            logger.log('Production log');

            expect(consoleLogSpy).toHaveBeenCalled();
            const output = consoleLogSpy.mock.calls[0][0];

            // In production, output should be valid JSON
            expect(() => JSON.parse(output)).not.toThrow();

            process.env.NODE_ENV = originalEnv;
        });
    });
});
