import { describe, it, expect } from 'vitest';
import {
    TransactionAlreadyUsedError,
    TransactionRecipientMismatchError,
    InsufficientPaymentError,
    InsufficientBalanceError,
    TemplateNotFoundError,
    OwnableNotFoundError,
    QueueDisabledError,
    OwnableCreationError,
    EventChainCreationError,
    RateLimitExceededError,
    InvalidStateError,
} from './business.errors';
import { isOBuilderError } from './base.error';

describe('business.errors', () => {
    describe('TransactionAlreadyUsedError', () => {
        it('should have correct tag and status', () => {
            const error = new TransactionAlreadyUsedError('0x123456789abcdef');
            expect(error._tag).toBe('TransactionAlreadyUsedError');
            expect(error.httpStatus).toBe(409);
            expect(error.code).toBe('TRANSACTION_ALREADY_USED');
        });

        it('should truncate long transaction IDs', () => {
            const longTxId = '0x1234567890abcdef1234567890abcdef';
            const error = new TransactionAlreadyUsedError(longTxId);
            expect(error.message).toContain('0x1234...cdef');
        });

        it('should not truncate short transaction IDs', () => {
            const shortTxId = '0x123';
            const error = new TransactionAlreadyUsedError(shortTxId);
            expect(error.message).toContain('0x123');
        });

        it('should be identified as OBuilderError', () => {
            const error = new TransactionAlreadyUsedError('tx-id');
            expect(isOBuilderError(error)).toBe(true);
        });
    });

    describe('TransactionRecipientMismatchError', () => {
        it('should have correct tag and status', () => {
            const error = new TransactionRecipientMismatchError();
            expect(error._tag).toBe('TransactionRecipientMismatchError');
            expect(error.httpStatus).toBe(403);
            expect(error.code).toBe('RECIPIENT_MISMATCH');
        });

        it('should have proper message', () => {
            const error = new TransactionRecipientMismatchError();
            expect(error.message).toContain('recipient');
            expect(error.message).toContain('obuilder wallet');
        });
    });

    describe('InsufficientPaymentError', () => {
        it('should have correct tag and status', () => {
            const error = new InsufficientPaymentError('100', '50');
            expect(error._tag).toBe('InsufficientPaymentError');
            expect(error.httpStatus).toBe(402);
            expect(error.code).toBe('INSUFFICIENT_PAYMENT');
        });

        it('should include required and received amounts', () => {
            const error = new InsufficientPaymentError('100 LTO', '50 LTO');
            expect(error.message).toContain('100 LTO');
            expect(error.message).toContain('50 LTO');
        });
    });

    describe('InsufficientBalanceError', () => {
        it('should have correct tag and status', () => {
            const error = new InsufficientBalanceError('LTO', 'minting');
            expect(error._tag).toBe('InsufficientBalanceError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('INSUFFICIENT_BALANCE');
        });

        it('should handle LTO wallet type', () => {
            const error = new InsufficientBalanceError('LTO', 'transfer');
            expect(error.message).toContain('LTO wallet');
            expect(error.message).toContain('transfer');
        });

        it('should handle EVM wallet type', () => {
            const error = new InsufficientBalanceError('EVM', 'gas fees');
            expect(error.message).toContain('EVM wallet');
            expect(error.message).toContain('gas fees');
        });
    });

    describe('TemplateNotFoundError', () => {
        it('should have correct tag and status', () => {
            const error = new TemplateNotFoundError(123);
            expect(error._tag).toBe('TemplateNotFoundError');
            expect(error.httpStatus).toBe(404);
            expect(error.code).toBe('TEMPLATE_NOT_FOUND');
        });

        it('should include template ID', () => {
            const error = new TemplateNotFoundError(42);
            expect(error.message).toContain('42');
        });
    });

    describe('OwnableNotFoundError', () => {
        it('should have correct tag and status', () => {
            const error = new OwnableNotFoundError('ownable-id-123');
            expect(error._tag).toBe('OwnableNotFoundError');
            expect(error.httpStatus).toBe(404);
            expect(error.code).toBe('OWNABLE_NOT_FOUND');
        });

        it('should include identifier', () => {
            const error = new OwnableNotFoundError('my-ownable');
            expect(error.message).toContain('my-ownable');
        });
    });

    describe('QueueDisabledError', () => {
        it('should have correct tag and status', () => {
            const error = new QueueDisabledError('mainnet');
            expect(error._tag).toBe('QueueDisabledError');
            expect(error.httpStatus).toBe(503);
            expect(error.code).toBe('QUEUE_DISABLED');
        });

        it('should include network type mainnet', () => {
            const error = new QueueDisabledError('mainnet');
            expect(error.message).toContain('mainnet');
        });

        it('should include network type testnet', () => {
            const error = new QueueDisabledError('testnet');
            expect(error.message).toContain('testnet');
        });
    });

    describe('OwnableCreationError', () => {
        it('should have correct tag and status', () => {
            const error = new OwnableCreationError('timeout');
            expect(error._tag).toBe('OwnableCreationError');
            expect(error.httpStatus).toBe(500);
            expect(error.code).toBe('OWNABLE_CREATION_FAILED');
        });

        it('should include reason', () => {
            const error = new OwnableCreationError('upload failed');
            expect(error.message).toContain('upload failed');
        });

        it('should capture cause', () => {
            const cause = new Error('Original error');
            const error = new OwnableCreationError('reason', cause);
            expect(error.cause).toBe(cause);
        });
    });

    describe('EventChainCreationError', () => {
        it('should have correct tag and status', () => {
            const error = new EventChainCreationError('chain init failed');
            expect(error._tag).toBe('EventChainCreationError');
            expect(error.httpStatus).toBe(500);
            expect(error.code).toBe('EVENT_CHAIN_CREATION_FAILED');
        });

        it('should include reason', () => {
            const error = new EventChainCreationError('network timeout');
            expect(error.message).toContain('network timeout');
        });

        it('should capture cause', () => {
            const cause = new Error('Network error');
            const error = new EventChainCreationError('reason', cause);
            expect(error.cause).toBe(cause);
        });
    });

    describe('RateLimitExceededError', () => {
        it('should have correct tag and status', () => {
            const error = new RateLimitExceededError();
            expect(error._tag).toBe('RateLimitExceededError');
            expect(error.httpStatus).toBe(429);
            expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
        });

        it('should include retry time when provided', () => {
            const error = new RateLimitExceededError(60);
            expect(error.message).toContain('60 seconds');
        });

        it('should have generic message when no retry time', () => {
            const error = new RateLimitExceededError();
            expect(error.message).toContain('try again later');
        });
    });

    describe('InvalidStateError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidStateError('mint', 'processing');
            expect(error._tag).toBe('InvalidStateError');
            expect(error.httpStatus).toBe(409);
            expect(error.code).toBe('INVALID_STATE');
        });

        it('should include operation and state', () => {
            const error = new InvalidStateError('transfer', 'pending');
            expect(error.message).toContain('transfer');
            expect(error.message).toContain('pending');
        });
    });

    describe('toJSON serialization', () => {
        it('should serialize all error types correctly', () => {
            const errors = [
                new TransactionAlreadyUsedError('tx-id'),
                new TransactionRecipientMismatchError(),
                new InsufficientPaymentError('100', '50'),
                new QueueDisabledError('mainnet'),
                new RateLimitExceededError(30),
            ];

            for (const error of errors) {
                const json = error.toJSON();
                expect(json.error).toBe(error._tag);
                expect(json.message).toBe(error.message);
                expect(json.code).toBe(error.code);
                expect(json.timestamp).toBeDefined();
            }
        });
    });
});
