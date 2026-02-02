/**
 * Validation Errors
 * 
 * Errors related to input validation failures.
 * These are typically 400 Bad Request errors.
 */

import { OBuilderError } from './base.error';

/**
 * Invalid address format error
 */
export class InvalidAddressError extends OBuilderError {
    readonly _tag = 'InvalidAddressError' as const;
    readonly httpStatus = 400;
    readonly code = 'INVALID_ADDRESS';

    constructor(address: string, reason: string) {
        // Don't include full address in message to avoid log pollution
        const truncated = address.length > 10
            ? `${address.slice(0, 6)}...${address.slice(-4)}`
            : address;
        super(`Invalid address "${truncated}": ${reason}`);
    }
}

/**
 * Invalid transaction ID error
 */
export class InvalidTransactionIdError extends OBuilderError {
    readonly _tag = 'InvalidTransactionIdError' as const;
    readonly httpStatus = 400;
    readonly code = 'INVALID_TRANSACTION_ID';

    constructor(txId: string, reason: string) {
        const truncated = txId.length > 10
            ? `${txId.slice(0, 6)}...${txId.slice(-4)}`
            : txId;
        super(`Invalid transaction ID "${truncated}": ${reason}`);
    }
}

/**
 * Invalid network ID error
 */
export class InvalidNetworkIdError extends OBuilderError {
    readonly _tag = 'InvalidNetworkIdError' as const;
    readonly httpStatus = 400;
    readonly code = 'INVALID_NETWORK_ID';

    constructor(networkId: string) {
        super(`Invalid network ID "${networkId}". Expected 'L' (mainnet) or 'T' (testnet)`);
    }
}

/**
 * Invalid chain error
 */
export class InvalidChainError extends OBuilderError {
    readonly _tag = 'InvalidChainError' as const;
    readonly httpStatus = 400;
    readonly code = 'INVALID_CHAIN';

    constructor(chain: string) {
        super(`Invalid chain "${chain}". Supported: ethereum, arbitrum, polygon, base`);
    }
}

/**
 * Invalid template ID error
 */
export class InvalidTemplateIdError extends OBuilderError {
    readonly _tag = 'InvalidTemplateIdError' as const;
    readonly httpStatus = 400;
    readonly code = 'INVALID_TEMPLATE_ID';

    constructor(templateId: number) {
        super(`Invalid template ID "${templateId}". Must be between 1 and 1000`);
    }
}

/**
 * Missing required field error
 */
export class MissingRequiredFieldError extends OBuilderError {
    readonly _tag = 'MissingRequiredFieldError' as const;
    readonly httpStatus = 400;
    readonly code = 'MISSING_REQUIRED_FIELD';

    constructor(fieldName: string) {
        super(`Missing required field: ${fieldName}`);
    }
}

/**
 * Invalid signature error
 */
export class InvalidSignatureError extends OBuilderError {
    readonly _tag = 'InvalidSignatureError' as const;
    readonly httpStatus = 401;
    readonly code = 'INVALID_SIGNATURE';

    constructor(reason: string) {
        super(`Invalid signature: ${reason}`);
    }
}

/**
 * Zod validation error wrapper
 */
export class ValidationError extends OBuilderError {
    readonly _tag = 'ValidationError' as const;
    readonly httpStatus = 400;
    readonly code = 'VALIDATION_FAILED';

    constructor(
        message: string,
        public readonly errors: Array<{ path: string; message: string }>,
    ) {
        super(message);
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            validationErrors: this.errors,
        };
    }
}
