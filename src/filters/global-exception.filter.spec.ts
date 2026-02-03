import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';
import { GlobalExceptionFilter } from './global-exception.filter';
import { OBuilderError } from '../errors/base.error';
import { ValidationError } from '../errors/validation.errors';

// Create a concrete implementation of OBuilderError for testing
class TestOBuilderError extends OBuilderError {
    readonly _tag = 'TestError' as const;
    readonly httpStatus = 400;
    readonly code = 'TEST_ERROR';

    constructor(message: string) {
        super(message);
    }
}

// Mock Request and Response
const createMockRequest = (overrides = {}) => ({
    url: '/test-path',
    method: 'GET',
    ...overrides,
});

const createMockResponse = () => {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res;
};

const createMockHost = (request: any, response: any): ArgumentsHost => ({
    switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http' as any,
});

describe('GlobalExceptionFilter', () => {
    let filter: GlobalExceptionFilter;
    let mockRequest: any;
    let mockResponse: any;
    let mockHost: ArgumentsHost;

    beforeEach(() => {
        filter = new GlobalExceptionFilter();
        mockRequest = createMockRequest();
        mockResponse = createMockResponse();
        mockHost = createMockHost(mockRequest, mockResponse);
    });

    describe('OBuilderError handling', () => {
        it('should handle OBuilderError and return proper status', () => {
            const error = new TestOBuilderError('Test error message');

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'TestError',
                    message: 'Test error message',
                })
            );
        });

        it('should include error code in response', () => {
            const error = new TestOBuilderError('Test error');

            filter.catch(error, mockHost);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'TEST_ERROR',
                })
            );
        });

        it('should include timestamp in response', () => {
            const error = new TestOBuilderError('Test error');

            filter.catch(error, mockHost);

            const jsonCall = mockResponse.json.mock.calls[0][0];
            expect(jsonCall.timestamp).toBeDefined();
        });
    });

    describe('ZodError handling', () => {
        it('should transform ZodError to ValidationError response', () => {
            const zodError = new ZodError([
                {
                    code: 'invalid_type',
                    expected: 'string',
                    received: 'number',
                    path: ['name'],
                    message: 'Expected string, received number',
                },
            ]);

            filter.catch(zodError, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'ValidationError',
                    message: 'Validation failed',
                })
            );
        });

        it('should handle multiple ZodError issues', () => {
            const zodError = new ZodError([
                {
                    code: 'invalid_type',
                    expected: 'string',
                    received: 'number',
                    path: ['name'],
                    message: 'Expected string',
                },
                {
                    code: 'invalid_type',
                    expected: 'number',
                    received: 'string',
                    path: ['age'],
                    message: 'Expected number',
                },
            ]);

            filter.catch(zodError, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
        });
    });

    describe('HttpException handling', () => {
        it('should handle HttpException with string response', () => {
            const error = new HttpException('Not found', HttpStatus.NOT_FOUND);

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(404);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'HttpException',
                    message: 'Not found',
                })
            );
        });

        it('should handle HttpException with object response', () => {
            const errorResponse = {
                statusCode: 403,
                message: 'Forbidden',
                error: 'Access denied',
            };
            const error = new HttpException(errorResponse, HttpStatus.FORBIDDEN);

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith(errorResponse);
        });

        it('should handle BadRequestException', () => {
            const error = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
        });

        it('should handle UnauthorizedException', () => {
            const error = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(401);
        });
    });

    describe('Unknown error handling', () => {
        it('should return 500 for unknown errors', () => {
            const error = new Error('Unknown error');

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'InternalServerError',
                    message: 'An unexpected error occurred. Please try again later.',
                })
            );
        });

        it('should handle non-Error objects', () => {
            const error = { someProperty: 'value' };

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });

        it('should handle string errors', () => {
            const error = 'Something went wrong';

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });

        it('should handle null errors', () => {
            filter.catch(null, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });

        it('should handle undefined errors', () => {
            filter.catch(undefined, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });
    });

    describe('Request context', () => {
        it('should handle different request methods', () => {
            mockRequest = createMockRequest({ method: 'POST' });
            mockHost = createMockHost(mockRequest, mockResponse);
            const error = new TestOBuilderError('Test');

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
        });

        it('should handle different request URLs', () => {
            mockRequest = createMockRequest({ url: '/api/v1/ownables' });
            mockHost = createMockHost(mockRequest, mockResponse);
            const error = new TestOBuilderError('Test');

            filter.catch(error, mockHost);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
        });
    });
});
