import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    try {
      const redisConfig = {
        host: this.config.get('redis.host'),
        port: this.config.get('redis.port'),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
      };

      // Main Redis client for operations
      this.redis = new Redis(redisConfig);

      // Separate clients for pub/sub to avoid blocking
      this.subscriber = new Redis(redisConfig);
      this.publisher = new Redis(redisConfig);

      // Event handlers
      this.redis.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.redis.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

      // Test connection
      await this.redis.ping();
      this.logger.log('Redis service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis service:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await Promise.all([
        this.redis?.quit(),
        this.subscriber?.quit(),
        this.publisher?.quit(),
      ]);
      this.logger.log('Redis connections closed');
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error);
    }
  }

  // Queue Operations
  async enqueue(queueName: string, data: any): Promise<void> {
    await this.redis.lpush(queueName, JSON.stringify(data));
  }

  async dequeue(queueName: string, timeout: number = 10): Promise<any | null> {
    const result = await this.redis.brpop(queueName, timeout);
    return result ? JSON.parse(result[1]) : null;
  }

  async queueLength(queueName: string): Promise<number> {
    return await this.redis.llen(queueName);
  }

  async peekQueue(queueName: string, count: number = 1): Promise<any[]> {
    const items = await this.redis.lrange(queueName, 0, count - 1);
    return items.map((item) => JSON.parse(item));
  }

  // Logging Operations
  async addLog(
    requestId: string,
    level: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    const logEntry = {
      requestId,
      level,
      message,
      metadata,
      timestamp: new Date().toISOString(),
      service: 'obuilder',
    };

    const logKey = `logs:${requestId}`;
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.expire(logKey, 86400); // 24 hours TTL

    // Publish to monitoring channel
    await this.publisher.publish('logs:stream', JSON.stringify(logEntry));
  }

  async getLogs(requestId: string): Promise<any[]> {
    const logKey = `logs:${requestId}`;
    const logs = await this.redis.lrange(logKey, 0, -1);
    return logs.map((log) => JSON.parse(log));
  }

  async getAllLogs(pattern: string = 'logs:*'): Promise<any[]> {
    const keys = await this.redis.keys(pattern);
    const allLogs = [];

    for (const key of keys) {
      const logs = await this.redis.lrange(key, 0, -1);
      allLogs.push(...logs.map((log) => JSON.parse(log)));
    }

    return allLogs.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  // Key-Value Operations
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async get(key: string): Promise<any | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  // Hash Operations
  async hset(key: string, field: string, value: any): Promise<void> {
    await this.redis.hset(key, field, JSON.stringify(value));
  }

  async hget(key: string, field: string): Promise<any | null> {
    const value = await this.redis.hget(key, field);
    return value ? JSON.parse(value) : null;
  }

  async hgetall(key: string): Promise<Record<string, any>> {
    const hash = await this.redis.hgetall(key);
    const result: Record<string, any> = {};

    for (const [field, value] of Object.entries(hash)) {
      result[field] = JSON.parse(value as string);
    }

    return result;
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redis.hdel(key, field);
  }

  // Pub/Sub Operations
  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(
    channel: string,
    callback: (message: any) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(JSON.parse(message));
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  // List Operations
  async lpush(key: string, ...values: any[]): Promise<number> {
    const serialized = values.map((v) => JSON.stringify(v));
    return await this.redis.lpush(key, ...serialized);
  }

  async rpop(key: string): Promise<any | null> {
    const value = await this.redis.rpop(key);
    return value ? JSON.parse(value) : null;
  }

  async lrange(key: string, start: number, stop: number): Promise<any[]> {
    const values = await this.redis.lrange(key, start, stop);
    return values.map((v) => JSON.parse(v));
  }

  async llen(key: string): Promise<number> {
    return await this.redis.llen(key);
  }

  // Set Operations
  async sadd(key: string, ...members: any[]): Promise<number> {
    const serialized = members.map((m) => JSON.stringify(m));
    return await this.redis.sadd(key, ...serialized);
  }

  async smembers(key: string): Promise<any[]> {
    const members = await this.redis.smembers(key);
    return members.map((m) => JSON.parse(m));
  }

  async srem(key: string, ...members: any[]): Promise<number> {
    const serialized = members.map((m) => JSON.stringify(m));
    return await this.redis.srem(key, ...serialized);
  }

  // Utility Operations
  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }

  async flushdb(): Promise<void> {
    await this.redis.flushdb();
  }

  async ping(): Promise<string> {
    return await this.redis.ping();
  }

  async info(section?: string): Promise<string> {
    return await this.redis.info(section);
  }

  // Health Check
  async healthCheck(): Promise<{
    status: string;
    latency: number;
    info?: any;
  }> {
    const start = Date.now();
    try {
      const pong = await this.redis.ping();
      const latency = Date.now() - start;

      if (pong === 'PONG') {
        return {
          status: 'healthy',
          latency,
          info: {
            connected: true,
            memory: await this.getMemoryInfo(),
          },
        };
      } else {
        return {
          status: 'unhealthy',
          latency,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
      };
    }
  }

  private async getMemoryInfo(): Promise<any> {
    try {
      const info = await this.redis.info('memory');
      const lines = info.split('\r\n');
      const memoryInfo: any = {};

      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          memoryInfo[key] = value;
        }
      }

      return memoryInfo;
    } catch (error) {
      return null;
    }
  }

  // Get the Redis client for advanced operations
  getClient(): Redis {
    return this.redis;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  getPublisher(): Redis {
    return this.publisher;
  }
}
