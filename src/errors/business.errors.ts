/**
 * Business Logic Errors
 * 
 * Errors related to business rule violations.
 * These indicate that the request was valid but cannot be processed
 * due to business constraints.
 */

import { OBuilderError } from './base.error';

/**
 * Transaction already used to create an ownable
 */
export class TransactionAlreadyUsedError extends OBuilderError {
    readonly _tag = 'TransactionAlreadyUsedError' as const;
    readonly httpStatus = 409;
    readonly code = 'TRANSACTION_ALREADY_USED';

    constructor(txId: string) {
        const truncated = txId.length > 10
            ? `${txId.slice(0, 6)}...${txId.slice(-4)}`
            : txId;
        super(`Transaction ${truncated} has already been used to create an ownable`);
    }
}

/**
 * Transaction recipient mismatch
 */
export class TransactionRecipientMismatchError extends OBuilderError {
    readonly _tag = 'TransactionRecipientMismatchError' as const;
    readonly httpStatus = 403;
    readonly code = 'RECIPIENT_MISMATCH';

    constructor() {
        super('Transaction recipient does not match the expected obuilder wallet');
    }
}

/**
 * Transaction amount too low
 */
export class InsufficientPaymentError extends OBuilderError {
    readonly _tag = 'InsufficientPaymentError' as const;
    readonly httpStatus = 402;
    readonly code = 'INSUFFICIENT_PAYMENT';

    constructor(required: string, received: string) {
        super(`Insufficient payment: required ${required}, received ${received}`);
    }
}

/**
 * Wallet balance too low for operation
 */
export class InsufficientBalanceError extends OBuilderError {
    readonly _tag = 'InsufficientBalanceError' as const;
    readonly httpStatus = 503;
    readonly code = 'INSUFFICIENT_BALANCE';

    constructor(wallet: 'LTO' | 'EVM', operation: string) {
        super(`${wallet} wallet has insufficient balance for ${operation}`);
    }
}

/**
 * Template not found
 */
export class TemplateNotFoundError extends OBuilderError {
    readonly _tag = 'TemplateNotFoundError' as const;
    readonly httpStatus = 404;
    readonly code = 'TEMPLATE_NOT_FOUND';

    constructor(templateId: number) {
        super(`Template with ID ${templateId} not found`);
    }
}

/**
 * Ownable not found
 */
export class OwnableNotFoundError extends OBuilderError {
    readonly _tag = 'OwnableNotFoundError' as const;
    readonly httpStatus = 404;
    readonly code = 'OWNABLE_NOT_FOUND';

    constructor(identifier: string) {
        super(`Ownable "${identifier}" not found`);
    }
}

/**
 * Queue is disabled for the network
 */
export class QueueDisabledError extends OBuilderError {
    readonly _tag = 'QueueDisabledError' as const;
    readonly httpStatus = 503;
    readonly code = 'QUEUE_DISABLED';

    constructor(network: 'mainnet' | 'testnet') {
        super(`Queue processing is currently disabled for ${network}`);
    }
}

/**
 * Ownable creation failed
 */
export class OwnableCreationError extends OBuilderError {
    readonly _tag = 'OwnableCreationError' as const;
    readonly httpStatus = 500;
    readonly code = 'OWNABLE_CREATION_FAILED';

    constructor(reason: string, cause?: unknown) {
        super(`Failed to create ownable: ${reason}`, cause);
    }
}

/**
 * Event chain creation failed
 */
export class EventChainCreationError extends OBuilderError {
    readonly _tag = 'EventChainCreationError' as const;
    readonly httpStatus = 500;
    readonly code = 'EVENT_CHAIN_CREATION_FAILED';

    constructor(reason: string, cause?: unknown) {
        super(`Failed to create event chain: ${reason}`, cause);
    }
}

/**
 * Rate limit exceeded (obuilder internal)
 */
export class RateLimitExceededError extends OBuilderError {
    readonly _tag = 'RateLimitExceededError' as const;
    readonly httpStatus = 429;
    readonly code = 'RATE_LIMIT_EXCEEDED';

    constructor(retryAfterSeconds?: number) {
        super(
            retryAfterSeconds
                ? `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds`
                : 'Rate limit exceeded. Please try again later',
        );
    }
}

/**
 * Operation not allowed in current state
 */
export class InvalidStateError extends OBuilderError {
    readonly _tag = 'InvalidStateError' as const;
    readonly httpStatus = 409;
    readonly code = 'INVALID_STATE';

    constructor(operation: string, currentState: string) {
        super(`Cannot perform ${operation} in current state: ${currentState}`);
    }
}
