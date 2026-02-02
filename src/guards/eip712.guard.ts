/**
 * EIP-712 Guard - EVM-native Authentication
 * 
 * Verifies EIP-712 typed data signatures for authenticated endpoints.
 * Uses ethers.verifyTypedData for cryptographic verification.
 * 
 * DAO Compliance: 
 * - Wallet-native signing (EIP-712)
 * - Non-custodial (server never holds user keys)
 * - Standard Ethereum authentication
 */
import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ethers } from 'ethers';

// Decorator to skip authentication on public endpoints
export const SKIP_AUTH_KEY = 'skipAuth';
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);

/**
 * EQTY Domain for EIP-712 typed data
 * This provides domain separation to prevent signature replay attacks
 */
export const EQTY_DOMAIN = {
    name: 'EQTY Ownables',
    version: '1',
    chainId: 8453, // Base mainnet
} as const;

/**
 * EIP-712 Types for authentication requests
 */
export const AUTH_TYPES = {
    AuthRequest: [
        { name: 'action', type: 'string' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'nonce', type: 'string' },
    ],
};

/**
 * Represents the signed authentication data
 */
export interface AuthRequestData {
    action: string;
    timestamp: number;
    nonce: string;
}

@Injectable()
export class EIP712Guard implements CanActivate {
    // Signature validity window (5 minutes)
    private readonly SIGNATURE_TTL_MS = 5 * 60 * 1000;

    constructor(private readonly reflector: Reflector) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if route has @SkipAuth() decorator
        const skipAuth = this.reflector.getAllAndOverride<boolean>(SKIP_AUTH_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (skipAuth) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();

        // Check for EIP-712 signature headers
        const signature = request.headers['x-eqty-signature'] as string;
        const message = request.headers['x-eqty-message'] as string;

        // If no signature provided, allow request (backward compatibility during migration)
        // TODO: Make signature mandatory after full migration
        if (!signature || !message) {
            return true;
        }

        try {
            // Parse the signed message
            const authData: AuthRequestData = JSON.parse(
                Buffer.from(message, 'base64').toString('utf8'),
            );

            // Validate timestamp (prevent replay attacks)
            const now = Date.now();
            if (Math.abs(now - authData.timestamp) > this.SIGNATURE_TTL_MS) {
                throw new UnauthorizedException({
                    message: 'Signature expired',
                    code: 'SIGNATURE_EXPIRED',
                });
            }

            // Verify the EIP-712 signature
            const recoveredAddress = ethers.verifyTypedData(
                EQTY_DOMAIN,
                AUTH_TYPES,
                authData,
                signature,
            );

            // Attach signer address to request for downstream use
            (request as any).signerAddress = recoveredAddress;
            (request as any).authData = authData;

            return true;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }

            throw new UnauthorizedException({
                message: 'Invalid EIP-712 signature',
                code: 'INVALID_SIGNATURE',
            });
        }
    }
}
