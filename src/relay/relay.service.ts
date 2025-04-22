import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { Relay } from '@ltonetwork/relay';

@Injectable()
export class RelayService {
  private readonly logger = new Logger(RelayService.name);
  private relay: Relay;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second
  private readonly healthCheckInterval = 30000; // 30 seconds
  private isRelayHealthy = false;
  private healthCheckTimer: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.initializeRelay();
    this.startHealthChecks();
  }

  private initializeRelay() {
    const relayUrl = this.configService.get('relay.url');
    this.relay = new Relay(relayUrl);
  }

  private startHealthChecks() {
    this.healthCheckTimer = setInterval(async () => {
      await this.checkRelayHealth();
    }, this.healthCheckInterval);
  }

  private async checkRelayHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.configService.get('relay.url')}/health`)
      );
      this.isRelayHealthy = response.status === 200;
      return this.isRelayHealthy;
    } catch (error) {
      this.isRelayHealthy = false;
      this.logger.error('Relay health check failed', error);
      return false;
    }
  }

  public async sendMessage(message: any, rid: string): Promise<any> {
    if (!this.isRelayHealthy) {
      throw new Error('Relay server is not healthy');
    }

    let lastError: Error;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.relay.send(message);
        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt} failed to send message to relay`, error);
        
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
          await this.checkRelayHealth();
        }
      }
    }
    
    throw new Error(`Failed to send message after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  public async getRelayStatus(): Promise<{ healthy: boolean; url: string }> {
    return {
      healthy: this.isRelayHealthy,
      url: this.configService.get('relay.url'),
    };
  }

  onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
} 