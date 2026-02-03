import { Injectable, Logger } from '@nestjs/common';

/**
 * OwnableValidationService
 *
 * Pure validation functions extracted from UploadZipService.
 * Contains no external dependencies - easy to test and maintain.
 */
@Injectable()
export class OwnableValidationService {
    private readonly logger = new Logger(OwnableValidationService.name);

    /**
     * Validate package name format
     * Only alphanumeric characters allowed, with optional .webp extension
     */
    public isValidPackageName(name: string): boolean {
        // Note: No /g flag to avoid stateful regex issues between calls
        const xidRegex = /^[a-zA-Z0-9]+(\.webp)?$/;
        const isValid = xidRegex.test(name);
        this.logger.debug(`isValidPackageName(${name}): ${isValid}`);
        return isValid;
    }

    /**
     * Sanitize package name by removing invalid characters
     * @param name Original package name
     * @param hasdotWebp Whether to preserve .webp extension
     */
    public sanitizePackageName(name: string, hasdotWebp: boolean): string {
        let baseStr: string = name;
        let extension: string = '';

        if (hasdotWebp && name.endsWith('.webp')) {
            baseStr = name.slice(0, -5); // Remove the .webp part
            extension = '.webp';
        }

        // Replace all non-alphanumeric characters with nothing
        const sanitizedBaseStr = baseStr.replace(/[^a-zA-Z0-9]/g, '');
        return sanitizedBaseStr + extension;
    }

    /**
     * Check if string is a valid Ethereum address format (0x + 40 hex chars)
     */
    public isEVMAddress(address: string): boolean {
        if (!address || typeof address !== 'string') {
            return false;
        }
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Validate Ethereum address and return network type
     * @returns 'mainnet' for valid addresses, 'false' otherwise
     */
    public isValidAddress(address: string): string {
        if (this.isEVMAddress(address)) {
            return 'mainnet'; // Valid Ethereum address
        }
        return 'false';
    }

    /**
     * Validate template ID is within valid range
     */
    public isValidTemplateId(templateId: number): boolean {
        return Number.isInteger(templateId) && templateId >= 0;
    }

    /**
     * Validate request ID format (UUID-like)
     */
    public isValidRequestId(requestId: string): boolean {
        if (!requestId || typeof requestId !== 'string') {
            return false;
        }
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId);
    }
}
