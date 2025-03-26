import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../config/config.service'; // Use your custom ConfigService
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractKeyFromRequest(request);
    const validApiKey = this.configService.get('api.secretKey');

    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    
    return true;
  }

  private extractKeyFromRequest(request: Request): string | undefined {
    // Option 1: Extract from headers
    const apiKey = request.headers['x-api-key'];
    if (apiKey) return Array.isArray(apiKey) ? apiKey[0] : apiKey;
    
    // Option 2: Extract from query parameters
    return request.query.apiKey as string;
  }
} 