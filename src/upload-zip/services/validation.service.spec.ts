import { describe, it, expect, beforeEach } from 'vitest';
import { OwnableValidationService } from './validation.service';

describe('OwnableValidationService', () => {
    let service: OwnableValidationService;

    beforeEach(() => {
        service = new OwnableValidationService();
    });

    describe('isValidPackageName', () => {
        it('should return true for simple alphanumeric names', () => {
            expect(service.isValidPackageName('testpackage')).toBe(true);
            expect(service.isValidPackageName('TestPackage123')).toBe(true);
            expect(service.isValidPackageName('abc')).toBe(true);
        });

        it('should return true for names with .webp extension', () => {
            expect(service.isValidPackageName('image123.webp')).toBe(true);
            expect(service.isValidPackageName('test.webp')).toBe(true);
        });

        it('should return false for names with special characters', () => {
            expect(service.isValidPackageName('test-package')).toBe(false);
            expect(service.isValidPackageName('test_package')).toBe(false);
            expect(service.isValidPackageName('test package')).toBe(false);
            expect(service.isValidPackageName('test@package')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(service.isValidPackageName('')).toBe(false);
        });

        it('should return false for just .webp', () => {
            expect(service.isValidPackageName('.webp')).toBe(false);
        });
    });

    describe('sanitizePackageName', () => {
        it('should remove invalid characters', () => {
            expect(service.sanitizePackageName('test-package', false)).toBe('testpackage');
            expect(service.sanitizePackageName('test_package', false)).toBe('testpackage');
            expect(service.sanitizePackageName('test package', false)).toBe('testpackage');
            expect(service.sanitizePackageName('test@#$%package', false)).toBe('testpackage');
        });

        it('should preserve .webp extension when hasdotWebp is true', () => {
            expect(service.sanitizePackageName('test-image.webp', true)).toBe('testimage.webp');
            expect(service.sanitizePackageName('invalid_name.webp', true)).toBe('invalidname.webp');
        });

        it('should not add .webp when hasdotWebp is false', () => {
            expect(service.sanitizePackageName('test-image.webp', false)).toBe('testimagewebp');
        });

        it('should handle already valid names', () => {
            expect(service.sanitizePackageName('validname', false)).toBe('validname');
            expect(service.sanitizePackageName('valid123', false)).toBe('valid123');
        });
    });

    describe('isEVMAddress', () => {
        it('should validate correct Ethereum addresses', () => {
            expect(service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(true);
            expect(service.isEVMAddress('0x0000000000000000000000000000000000000000')).toBe(true);
        });

        it('should reject addresses without 0x prefix', () => {
            expect(service.isEVMAddress('742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe(false);
        });

        it('should reject addresses with wrong length', () => {
            expect(service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1')).toBe(false); // too short
            expect(service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD155')).toBe(false); // too long
        });

        it('should reject non-hex characters', () => {
            expect(service.isEVMAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bDGH')).toBe(false);
        });

        it('should reject null/undefined/empty', () => {
            expect(service.isEVMAddress(null as any)).toBe(false);
            expect(service.isEVMAddress(undefined as any)).toBe(false);
            expect(service.isEVMAddress('')).toBe(false);
        });
    });

    describe('isValidAddress', () => {
        it('should return mainnet for valid addresses', () => {
            expect(service.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD15')).toBe('mainnet');
        });

        it('should return false for invalid addresses', () => {
            expect(service.isValidAddress('invalid')).toBe('false');
            expect(service.isValidAddress('')).toBe('false');
        });
    });

    describe('isValidTemplateId', () => {
        it('should return true for valid template IDs', () => {
            expect(service.isValidTemplateId(0)).toBe(true);
            expect(service.isValidTemplateId(1)).toBe(true);
            expect(service.isValidTemplateId(100)).toBe(true);
        });

        it('should return false for negative IDs', () => {
            expect(service.isValidTemplateId(-1)).toBe(false);
        });

        it('should return false for non-integer values', () => {
            expect(service.isValidTemplateId(1.5)).toBe(false);
            expect(service.isValidTemplateId(NaN)).toBe(false);
        });
    });

    describe('isValidRequestId', () => {
        it('should return true for valid UUIDs', () => {
            expect(service.isValidRequestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
            expect(service.isValidRequestId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
        });

        it('should return false for invalid UUIDs', () => {
            expect(service.isValidRequestId('not-a-uuid')).toBe(false);
            expect(service.isValidRequestId('550e8400-e29b-41d4-a716')).toBe(false); // too short
        });

        it('should return false for null/undefined/empty', () => {
            expect(service.isValidRequestId(null as any)).toBe(false);
            expect(service.isValidRequestId(undefined as any)).toBe(false);
            expect(service.isValidRequestId('')).toBe(false);
        });
    });
});
