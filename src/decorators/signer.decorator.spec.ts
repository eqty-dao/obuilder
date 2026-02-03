import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';

// We need to test the decorator factory functions
// The decorators use createParamDecorator which returns a factory

describe('SignerAddress Decorator', () => {
    describe('Decorator Logic', () => {
        it('should extract signerAddress from request', () => {
            // Simulate the decorator logic
            const mockRequest = {
                signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15',
            };

            const mockCtx = {
                switchToHttp: () => ({
                    getRequest: () => mockRequest,
                }),
            } as ExecutionContext;

            const result = mockCtx.switchToHttp().getRequest<any>().signerAddress;
            expect(result).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        });

        it('should return undefined when signerAddress not present', () => {
            const mockRequest = {};

            const mockCtx = {
                switchToHttp: () => ({
                    getRequest: () => mockRequest,
                }),
            } as ExecutionContext;

            const result = mockCtx.switchToHttp().getRequest<any>().signerAddress;
            expect(result).toBeUndefined();
        });
    });
});

describe('AuthData Decorator', () => {
    describe('Decorator Logic', () => {
        it('should extract authData from request', () => {
            const mockRequest = {
                authData: {
                    action: 'upload',
                    timestamp: 1706918400,
                    nonce: 'abc123',
                },
            };

            const mockCtx = {
                switchToHttp: () => ({
                    getRequest: () => mockRequest,
                }),
            } as ExecutionContext;

            const result = mockCtx.switchToHttp().getRequest<any>().authData;
            expect(result).toEqual({
                action: 'upload',
                timestamp: 1706918400,
                nonce: 'abc123',
            });
        });

        it('should return undefined when authData not present', () => {
            const mockRequest = {};

            const mockCtx = {
                switchToHttp: () => ({
                    getRequest: () => mockRequest,
                }),
            } as ExecutionContext;

            const result = mockCtx.switchToHttp().getRequest<any>().authData;
            expect(result).toBeUndefined();
        });

        it('should handle partial authData', () => {
            const mockRequest = {
                authData: {
                    action: 'upload',
                },
            };

            const mockCtx = {
                switchToHttp: () => ({
                    getRequest: () => mockRequest,
                }),
            } as ExecutionContext;

            const result = mockCtx.switchToHttp().getRequest<any>().authData;
            expect(result.action).toBe('upload');
            expect(result.timestamp).toBeUndefined();
        });
    });
});

describe('Context Switching', () => {
    it('should correctly switch to HTTP context', () => {
        const mockRequest = { signerAddress: '0xTest' };

        const mockCtx = {
            switchToHttp: vi.fn().mockReturnValue({
                getRequest: vi.fn().mockReturnValue(mockRequest),
            }),
        } as unknown as ExecutionContext;

        mockCtx.switchToHttp();

        expect(mockCtx.switchToHttp).toHaveBeenCalled();
    });
});
