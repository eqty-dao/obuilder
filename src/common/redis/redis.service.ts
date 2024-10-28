import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  async onModuleInit() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    await this.client.connect();
  }

  async set(key: string, value: any) {
    await this.client.set(key, JSON.stringify(value));
  }

  async get(key: string) {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async getKeys(pattern: string): Promise<string[]> {
    const keys = [];
    const iterator = this.client.scanIterator({ MATCH: pattern });
    for await (const key of iterator) {
      keys.push(key);
    }
    return keys;
  }

  async updateStatus(requestId: string, status: string) {
    const data = await this.get(requestId);
    if (data) {
      data.status = status;
      await this.set(requestId, data);
    }
  }

  async delete(key: string) {
    await this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
