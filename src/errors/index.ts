/**
 * Errors Module Index
 * 
 * Re-exports all error types for convenient imports.
 */

// Base
export { OBuilderError, isOBuilderError } from './base.error';

// Validation errors (400 series)
export {
    InvalidAddressError,
    InvalidTransactionIdError,
    InvalidNetworkIdError,
    InvalidChainError,
    InvalidTemplateIdError,
    MissingRequiredFieldError,
    InvalidSignatureError,
    ValidationError,
} from './validation.errors';

// Network errors (5xx series)
export {
    RelayUnreachableError,
    LtoNodeUnreachableError,
    IPFSPinningError,
    IPFSGatewayError,
    EvmRpcUnreachableError,
    AnchoringError,
    MintingError,
    S3StorageError,
    ExternalRateLimitError,
    ServiceTimeoutError,
} from './network.errors';

// Business logic errors (4xx series)
export {
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
