import { describe, it, expect } from 'vitest';
import {
    InvalidAddressError,
    InvalidTransactionIdError,
    InvalidNetworkIdError,
    InvalidChainError,
    InvalidTemplateIdError,
    MissingRequiredFieldError,
    InvalidSignatureError,
    ValidationError,
} from './validation.errors';
import { isOBuilderError } from './base.error';

describe('validation.errors', () => {
    describe('InvalidAddressError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidAddressError('0x123', 'invalid format');
            expect(error._tag).toBe('InvalidAddressError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('INVALID_ADDRESS');
        });

        it('should truncate long addresses', () => {
            const longAddr = '0x1234567890abcdef1234567890abcdef12345678';
            const error = new InvalidAddressError(longAddr, 'bad checksum');
            expect(error.message).toContain('0x1234...5678');
            expect(error.message).not.toContain(longAddr);
        });

        it('should not truncate short addresses', () => {
            const shortAddr = '0x123';
            const error = new InvalidAddressError(shortAddr, 'too short');
            expect(error.message).toContain('0x123');
        });

        it('should include reason', () => {
            const error = new InvalidAddressError('0x123', 'invalid checksum');
            expect(error.message).toContain('invalid checksum');
        });

        it('should be OBuilderError', () => {
            const error = new InvalidAddressError('0x123', 'test');
            expect(isOBuilderError(error)).toBe(true);
        });
    });

    describe('InvalidTransactionIdError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidTransactionIdError('tx123', 'invalid');
            expect(error._tag).toBe('InvalidTransactionIdError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('INVALID_TRANSACTION_ID');
        });

        it('should truncate long transaction IDs', () => {
            const longTxId = '0x1234567890abcdef1234567890abcdef';
            const error = new InvalidTransactionIdError(longTxId, 'not found');
            expect(error.message).toContain('0x1234...cdef');
        });

        it('should include reason', () => {
            const error = new InvalidTransactionIdError('tx', 'not confirmed');
            expect(error.message).toContain('not confirmed');
        });
    });

    describe('InvalidNetworkIdError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidNetworkIdError('X');
            expect(error._tag).toBe('InvalidNetworkIdError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('INVALID_NETWORK_ID');
        });

        it('should include network ID and valid options', () => {
            const error = new InvalidNetworkIdError('Z');
            expect(error.message).toContain('Z');
            expect(error.message).toContain('L');
            expect(error.message).toContain('T');
        });
    });

    describe('InvalidChainError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidChainError('solana');
            expect(error._tag).toBe('InvalidChainError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('INVALID_CHAIN');
        });

        it('should include chain and supported options', () => {
            const error = new InvalidChainError('bsc');
            expect(error.message).toContain('bsc');
            expect(error.message).toContain('base');
            expect(error.message).toContain('ethereum');
        });
    });

    describe('InvalidTemplateIdError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidTemplateIdError(0);
            expect(error._tag).toBe('InvalidTemplateIdError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('INVALID_TEMPLATE_ID');
        });

        it('should include template ID and valid range', () => {
            const error = new InvalidTemplateIdError(-1);
            expect(error.message).toContain('-1');
            expect(error.message).toContain('1');
            expect(error.message).toContain('1000');
        });

        it('should handle large invalid IDs', () => {
            const error = new InvalidTemplateIdError(99999);
            expect(error.message).toContain('99999');
        });
    });

    describe('MissingRequiredFieldError', () => {
        it('should have correct tag and status', () => {
            const error = new MissingRequiredFieldError('name');
            expect(error._tag).toBe('MissingRequiredFieldError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('MISSING_REQUIRED_FIELD');
        });

        it('should include field name', () => {
            const error = new MissingRequiredFieldError('walletAddress');
            expect(error.message).toContain('walletAddress');
        });
    });

    describe('InvalidSignatureError', () => {
        it('should have correct tag and status', () => {
            const error = new InvalidSignatureError('expired');
            expect(error._tag).toBe('InvalidSignatureError');
            expect(error.httpStatus).toBe(401);
            expect(error.code).toBe('INVALID_SIGNATURE');
        });

        it('should include reason', () => {
            const error = new InvalidSignatureError('signature mismatch');
            expect(error.message).toContain('signature mismatch');
        });
    });

    describe('ValidationError', () => {
        it('should have correct tag and status', () => {
            const error = new ValidationError('Validation failed', []);
            expect(error._tag).toBe('ValidationError');
            expect(error.httpStatus).toBe(400);
            expect(error.code).toBe('VALIDATION_FAILED');
        });

        it('should store errors array', () => {
            const validationErrors = [
                { path: 'name', message: 'required' },
                { path: 'age', message: 'must be positive' },
            ];
            const error = new ValidationError('Validation failed', validationErrors);
            expect(error.errors).toEqual(validationErrors);
        });

        it('should include validationErrors in toJSON', () => {
            const validationErrors = [
                { path: 'email', message: 'invalid format' },
            ];
            const error = new ValidationError('Validation failed', validationErrors);
            const json = error.toJSON();

            expect(json.validationErrors).toEqual(validationErrors);
            expect(json.error).toBe('ValidationError');
            expect(json.message).toBe('Validation failed');
        });

        it('should handle empty errors array', () => {
            const error = new ValidationError('No errors', []);
            expect(error.errors).toHaveLength(0);
            expect(error.toJSON().validationErrors).toEqual([]);
        });

        it('should handle deep paths', () => {
            const validationErrors = [
                { path: 'user.address.street', message: 'required' },
            ];
            const error = new ValidationError('Validation failed', validationErrors);
            expect(error.errors[0].path).toBe('user.address.street');
        });
    });

    describe('toJSON serialization', () => {
        it('should serialize all validation errors correctly', () => {
            const errors = [
                new InvalidAddressError('0x123', 'bad'),
                new InvalidTransactionIdError('tx', 'bad'),
                new InvalidNetworkIdError('X'),
                new InvalidChainError('bsc'),
                new InvalidTemplateIdError(0),
                new MissingRequiredFieldError('name'),
                new InvalidSignatureError('expired'),
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
