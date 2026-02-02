/**
 * Base Error Class
 * 
 * All obuilder errors extend this class for consistent error handling.
 * Provides structured error information for API responses and logging.
 * 
 * DAO Compliance Note:
 * - Errors never expose private data (EventChain contents, signatures, etc.)
 * - Error messages are safe for external API responses
 * - Internal details are only logged, never returned to clients
 */

/**
 * Abstract base class for all obuilder errors.
 * Provides consistent structure for error handling across the application.
 */
export abstract class OBuilderError extends Error {
    /**
     * Unique tag for error type identification.
     * Used for programmatic error handling.
     */
    abstract readonly _tag: string;

    /**
     * HTTP status code to return when this error occurs.
     */
    abstract readonly httpStatus: number;

    /**
     * Timestamp when the error occurred.
     */
    readonly timestamp: string;

    /**
     * Optional error code for more specific error identification.
     */
    readonly code?: string;

    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date().toISOString();

        // Maintain proper prototype chain
        Object.setPrototypeOf(this, new.target.prototype);

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Convert error to JSON for API responses.
     * Does NOT include stack trace or internal details.
     */
    toJSON(): Record<string, unknown> {
        return {
            error: this._tag,
            message: this.message,
            code: this.code,
            timestamp: this.timestamp,
        };
    }

    /**
     * Convert error to detailed object for logging.
     * ONLY use for internal logging, never expose to clients.
     */
    toLogObject(): Record<string, unknown> {
        return {
            ...this.toJSON(),
            stack: this.stack,
            cause: this.cause instanceof Error ? this.cause.message : this.cause,
        };
    }
}

/**
 * Type guard to check if an error is an OBuilderError
 */
export function isOBuilderError(error: unknown): error is OBuilderError {
    return error instanceof OBuilderError;
}
