/**
 * SignerAddress Decorator
 * 
 * Extracts the signer's EVM address from the request.
 * Works with EIP712Guard which attaches signerAddress to the request after verification.
 * 
 * Usage:
 *   uploadFile(@SignerAddress() signerAddress?: string) { ... }
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Parameter decorator that extracts the signer's Ethereum address
 * from requests verified by EIP712Guard.
 * 
 * Returns undefined if no signature was provided (backward compatibility mode).
 */
export const SignerAddress = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): string | undefined => {
        const request = ctx.switchToHttp().getRequest<Request>();
        return (request as any).signerAddress;
    },
);

/**
 * Parameter decorator that extracts the full auth data
 * from requests verified by EIP712Guard.
 */
export const AuthData = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): { action: string; timestamp: number; nonce: string } | undefined => {
        const request = ctx.switchToHttp().getRequest<Request>();
        return (request as any).authData;
    },
);
