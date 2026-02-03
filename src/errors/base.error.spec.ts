import { describe, it, expect } from 'vitest';
import { OBuilderError, isOBuilderError } from './base.error';

// Concrete implementation for testing abstract class
class TestError extends OBuilderError {
    readonly _tag = 'TestError';
    readonly httpStatus = 400;
    readonly code = 'TEST_001';

    constructor(message: string, cause?: unknown) {
        super(message, cause);
    }
}

class AnotherTestError extends OBuilderError {
    readonly _tag = 'AnotherTestError';
    readonly httpStatus = 500;

    constructor(message: string) {
        super(message);
    }
}

describe('OBuilderError', () => {
    describe('constructor', () => {
        it('should create error with message', () => {
            const error = new TestError('Test message');
            expect(error.message).toBe('Test message');
        });

        it('should set name to constructor name', () => {
            const error = new TestError('Test message');
            expect(error.name).toBe('TestError');
        });

        it('should set timestamp', () => {
            const beforeTime = new Date().toISOString();
            const error = new TestError('Test message');
            const afterTime = new Date().toISOString();

            expect(error.timestamp).toBeDefined();
            expect(error.timestamp >= beforeTime).toBe(true);
            expect(error.timestamp <= afterTime).toBe(true);
        });

        it('should store cause', () => {
            const originalError = new Error('Original error');
            const error = new TestError('Wrapped error', originalError);
            expect(error.cause).toBe(originalError);
        });

        it('should handle undefined cause', () => {
            const error = new TestError('Test message');
            expect(error.cause).toBeUndefined();
        });

        it('should capture stack trace', () => {
            const error = new TestError('Test message');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('TestError');
        });

        it('should be an instance of Error', () => {
            const error = new TestError('Test message');
            expect(error).toBeInstanceOf(Error);
        });

        it('should be an instance of OBuilderError', () => {
            const error = new TestError('Test message');
            expect(error).toBeInstanceOf(OBuilderError);
        });
    });

    describe('abstract properties', () => {
        it('should have _tag property', () => {
            const error = new TestError('Test message');
            expect(error._tag).toBe('TestError');
        });

        it('should have httpStatus property', () => {
            const error = new TestError('Test message');
            expect(error.httpStatus).toBe(400);
        });

        it('should have different values for different subclasses', () => {
            const testError = new TestError('Test');
            const anotherError = new AnotherTestError('Another');

            expect(testError._tag).toBe('TestError');
            expect(anotherError._tag).toBe('AnotherTestError');
            expect(testError.httpStatus).toBe(400);
            expect(anotherError.httpStatus).toBe(500);
        });
    });

    describe('code property', () => {
        it('should have code when defined', () => {
            const error = new TestError('Test message');
            expect(error.code).toBe('TEST_001');
        });

        it('should be undefined when not defined', () => {
            const error = new AnotherTestError('Test message');
            expect(error.code).toBeUndefined();
        });
    });

    describe('toJSON', () => {
        it('should return structured JSON object', () => {
            const error = new TestError('Test message');
            const json = error.toJSON();

            expect(json.error).toBe('TestError');
            expect(json.message).toBe('Test message');
            expect(json.code).toBe('TEST_001');
            expect(json.timestamp).toBeDefined();
        });

        it('should NOT include stack trace', () => {
            const error = new TestError('Test message');
            const json = error.toJSON();

            expect(json.stack).toBeUndefined();
        });

        it('should NOT include cause', () => {
            const error = new TestError('Test message', new Error('Cause'));
            const json = error.toJSON();

            expect(json.cause).toBeUndefined();
        });
    });

    describe('toLogObject', () => {
        it('should include all JSON properties', () => {
            const error = new TestError('Test message');
            const log = error.toLogObject();

            expect(log.error).toBe('TestError');
            expect(log.message).toBe('Test message');
            expect(log.code).toBe('TEST_001');
            expect(log.timestamp).toBeDefined();
        });

        it('should include stack trace', () => {
            const error = new TestError('Test message');
            const log = error.toLogObject();

            expect(log.stack).toBeDefined();
            expect(log.stack).toContain('TestError');
        });

        it('should include cause message when cause is Error', () => {
            const originalError = new Error('Original error message');
            const error = new TestError('Wrapped error', originalError);
            const log = error.toLogObject();

            expect(log.cause).toBe('Original error message');
        });

        it('should include cause directly when not Error', () => {
            const error = new TestError('Error with string cause', 'string cause');
            const log = error.toLogObject();

            expect(log.cause).toBe('string cause');
        });

        it('should handle undefined cause', () => {
            const error = new TestError('Test message');
            const log = error.toLogObject();

            expect(log.cause).toBeUndefined();
        });
    });
});

describe('isOBuilderError', () => {
    it('should return true for OBuilderError instances', () => {
        const error = new TestError('Test message');
        expect(isOBuilderError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
        const error = new Error('Regular error');
        expect(isOBuilderError(error)).toBe(false);
    });

    it('should return false for null', () => {
        expect(isOBuilderError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(isOBuilderError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
        expect(isOBuilderError('error string')).toBe(false);
    });

    it('should return false for object that looks like error', () => {
        const fakeError = {
            _tag: 'FakeError',
            httpStatus: 400,
            message: 'Fake',
        };
        expect(isOBuilderError(fakeError)).toBe(false);
    });
});
