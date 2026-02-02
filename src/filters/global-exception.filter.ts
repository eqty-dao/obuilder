/**
 * Global Exception Filter
 * 
 * Catches all exceptions and transforms them into consistent API responses.
 * Ensures that:
 * - OBuilderErrors are returned with their defined HTTP status and structure
 * - NestJS HttpExceptions are handled normally
 * - Unknown errors are logged but not exposed to clients
 * 
 * DAO Compliance Note:
 * - Internal error details (stack traces, cause) are NEVER sent to clients
 * - Sensitive data is NEVER logged or returned
 * - Only structured, safe error messages are returned
 */

import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { OBuilderError, isOBuilderError } from '../errors/base.error';
import { ValidationError } from '../errors/validation.errors';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // Handle OBuilderError
        if (isOBuilderError(exception)) {
            this.logError(exception, request);
            response.status(exception.httpStatus).json(exception.toJSON());
            return;
        }

        // Handle Zod validation errors
        if (exception instanceof ZodError) {
            const validationError = this.transformZodError(exception);
            this.logError(validationError, request);
            response.status(validationError.httpStatus).json(validationError.toJSON());
            return;
        }

        // Handle NestJS HttpException
        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            this.logger.warn(
                `HttpException: ${exception.message}`,
                { path: request.url, method: request.method, status },
            );

            response.status(status).json(
                typeof exceptionResponse === 'string'
                    ? { error: 'HttpException', message: exceptionResponse, timestamp: new Date().toISOString() }
                    : exceptionResponse,
            );
            return;
        }

        // Handle unknown errors - log fully but return minimal info
        this.logUnknownError(exception, request);

        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            error: 'InternalServerError',
            message: 'An unexpected error occurred. Please try again later.',
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Transform ZodError to ValidationError
     */
    private transformZodError(error: ZodError): ValidationError {
        const errors = error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
        }));

        return new ValidationError(
            'Validation failed',
            errors,
        );
    }

    /**
     * Log OBuilderError with context
     */
    private logError(error: OBuilderError, request: Request): void {
        const logContext = {
            path: request.url,
            method: request.method,
            errorTag: error._tag,
            errorCode: error.code,
            // DO NOT log request body - may contain sensitive data!
        };

        if (error.httpStatus >= 500) {
            this.logger.error(error.message, error.stack, logContext);
        } else if (error.httpStatus >= 400) {
            this.logger.warn(error.message, logContext);
        }
    }

    /**
     * Log unknown errors with full details for debugging
     */
    private logUnknownError(error: unknown, request: Request): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.logger.error(
            `Unhandled exception: ${errorMessage}`,
            errorStack,
            {
                path: request.url,
                method: request.method,
                errorType: error?.constructor?.name || 'Unknown',
                // DO NOT log request body - may contain sensitive data!
            },
        );
    }
}
