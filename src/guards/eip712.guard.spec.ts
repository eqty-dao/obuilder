import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EIP712Guard, SKIP_AUTH_KEY, EQTY_DOMAIN, AUTH_TYPES, AuthRequestData } from './eip712.guard';

// Mock ethers
vi.mock('ethers', () => ({
    ethers: {
        verifyTypedData: vi.fn().mockReturnValue('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15'),
    },
}));

describe('EIP712Guard', () => {
    let guard: EIP712Guard;
    let reflector: Reflector;

    const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => ({
        switchToHttp: () => ({
            getRequest: () => ({ headers }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as ExecutionContext);

    const createValidAuthData = (overrides: Partial<AuthRequestData> = {}): AuthRequestData => ({
        action: 'upload',
        timestamp: Date.now(),
        nonce: 'unique-nonce-123',
        ...overrides,
    });

    const encodeMessage = (data: AuthRequestData): string => {
        return Buffer.from(JSON.stringify(data)).toString('base64');
    };

    beforeEach(() => {
        vi.clearAllMocks();
        reflector = new Reflector();
        guard = new EIP712Guard(reflector);
    });

    describe('Initialization', () => {
        it('should be defined', () => {
            expect(guard).toBeDefined();
        });

        it('should have correct SIGNATURE_TTL_MS', () => {
            expect((guard as any).SIGNATURE_TTL_MS).toBe(5 * 60 * 1000);
        });
    });

    describe('Skip Authentication', () => {
        it('should allow request when @SkipAuth() is set', async () => {
            vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
            const context = createMockContext();
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('should reject when @SkipAuth() is not set and no credentials', async () => {
            vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
            const context = createMockContext();
            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('Missing Credentials', () => {
        beforeEach(() => {
            vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        });

        it('should reject request with no headers', async () => {
            const context = createMockContext({});
            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        it('should reject request with only signature header', async () => {
            const context = createMockContext({ 'x-eqty-signature': '0xsignature' });
            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        it('should reject request with only message header', async () => {
            const context = createMockContext({ 'x-eqty-message': 'base64message' });
            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('Signature Validation', () => {
        beforeEach(() => {
            vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        });

        it('should validate correct signature', async () => {
            const authData = createValidAuthData();
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': encodeMessage(authData),
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });

        it('should attach signer address to request', async () => {
            const authData = createValidAuthData();
            const mockRequest: any = { headers: {} };
            mockRequest.headers['x-eqty-signature'] = '0xvalidsignature';
            mockRequest.headers['x-eqty-message'] = encodeMessage(authData);

            const context = {
                switchToHttp: () => ({ getRequest: () => mockRequest }),
                getHandler: () => ({}),
                getClass: () => ({}),
            } as ExecutionContext;

            await guard.canActivate(context);
            expect(mockRequest.signerAddress).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15');
        });

        it('should attach authData to request', async () => {
            const authData = createValidAuthData();
            const mockRequest: any = { headers: {} };
            mockRequest.headers['x-eqty-signature'] = '0xvalidsignature';
            mockRequest.headers['x-eqty-message'] = encodeMessage(authData);

            const context = {
                switchToHttp: () => ({ getRequest: () => mockRequest }),
                getHandler: () => ({}),
                getClass: () => ({}),
            } as ExecutionContext;

            await guard.canActivate(context);
            expect(mockRequest.authData).toEqual(authData);
        });
    });

    describe('Timestamp Validation', () => {
        beforeEach(() => {
            vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        });

        it('should reject expired signature (too old)', async () => {
            const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
            const authData = createValidAuthData({ timestamp: oldTimestamp });
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': encodeMessage(authData),
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        it('should reject future signature (too new)', async () => {
            const futureTimestamp = Date.now() + 6 * 60 * 1000; // 6 minutes in future
            const authData = createValidAuthData({ timestamp: futureTimestamp });
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': encodeMessage(authData),
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        it('should accept signature within 5 minute window', async () => {
            const recentTimestamp = Date.now() - 4 * 60 * 1000; // 4 minutes ago
            const authData = createValidAuthData({ timestamp: recentTimestamp });
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': encodeMessage(authData),
            });

            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        });

        it('should throw UnauthorizedException for invalid JSON message', async () => {
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': 'not-valid-base64!!!',
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for corrupt base64', async () => {
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': Buffer.from('invalid json').toString('base64'),
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        it('should return correct error code for expired signature', async () => {
            const oldTimestamp = Date.now() - 6 * 60 * 1000;
            const authData = createValidAuthData({ timestamp: oldTimestamp });
            const context = createMockContext({
                'x-eqty-signature': '0xvalidsignature',
                'x-eqty-message': encodeMessage(authData),
            });

            try {
                await guard.canActivate(context);
            } catch (error) {
                expect((error as any).response.code).toBe('SIGNATURE_EXPIRED');
            }
        });

        it('should return correct error code for invalid signature', async () => {
            // Mock verifyTypedData to throw
            const ethers = await import('ethers');
            vi.spyOn(ethers.ethers, 'verifyTypedData').mockImplementationOnce(() => {
                throw new Error('Invalid signature');
            });

            const authData = createValidAuthData();
            const context = createMockContext({
                'x-eqty-signature': '0xinvalidsignature',
                'x-eqty-message': encodeMessage(authData),
            });

            try {
                await guard.canActivate(context);
            } catch (error) {
                expect((error as any).response.code).toBe('INVALID_SIGNATURE');
            }
        });
    });

    describe('Domain and Types Constants', () => {
        it('should have correct EQTY_DOMAIN', () => {
            expect(EQTY_DOMAIN.name).toBe('EQTY Ownables');
            expect(EQTY_DOMAIN.version).toBe('1');
            expect(EQTY_DOMAIN.chainId).toBe(8453);
        });

        it('should have correct AUTH_TYPES structure', () => {
            expect(AUTH_TYPES.AuthRequest).toHaveLength(3);
            expect(AUTH_TYPES.AuthRequest.map(t => t.name)).toContain('action');
            expect(AUTH_TYPES.AuthRequest.map(t => t.name)).toContain('timestamp');
            expect(AUTH_TYPES.AuthRequest.map(t => t.name)).toContain('nonce');
        });
    });
});
