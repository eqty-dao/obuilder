import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class DebuggerService {
  constructor(private readonly redisService: RedisService) {}

  async getRequestStatus(requestId: string) {
    const requestInfo = await this.redisService.get(requestId);
    if (!requestInfo) {
      throw new Error('Request ID not found');
    }
    return requestInfo;
  }
}
