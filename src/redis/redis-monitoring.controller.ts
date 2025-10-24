import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RedisService } from '../redis/redis.service';
import { LoggingService } from '../logging/redis-logging.service';
import { RedisQueueService } from '../queue/redis-queue.service';

@ApiTags('Redis Monitoring')
@Controller('redis')
export class RedisMonitoringController {
  constructor(
    private readonly redis: RedisService,
    private readonly logging: LoggingService,
    private readonly queue: RedisQueueService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get Redis health status' })
  @ApiResponse({ status: 200, description: 'Redis health information' })
  async getHealth() {
    const redisHealth = await this.redis.healthCheck();
    const loggingHealth = await this.logging.healthCheck();
    const queueHealth = await this.queue.healthCheck();

    return {
      redis: redisHealth,
      logging: loggingHealth,
      queue: queueHealth,
      overall:
        redisHealth.status === 'healthy' &&
        loggingHealth.status === 'healthy' &&
        queueHealth.status === 'healthy'
          ? 'healthy'
          : 'degraded',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('info')
  @ApiOperation({ summary: 'Get Redis server information' })
  @ApiResponse({ status: 200, description: 'Redis server information' })
  async getInfo(@Query('section') section?: string) {
    try {
      const info = await this.redis.info(section);
      return {
        info: info,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get logs from Redis' })
  @ApiResponse({ status: 200, description: 'Log entries' })
  async getLogs(
    @Query('requestId') requestId?: string,
    @Query('level') level?: string,
    @Query('limit') limit?: number,
  ) {
    try {
      let logs;

      if (requestId) {
        logs = await this.logging.getLogsByRid(requestId);
      } else if (level) {
        logs = await this.logging.getLogsByLevel(level);
      } else {
        logs = await this.logging.getLogs();
      }

      if (limit) {
        logs = logs.slice(0, limit);
      }

      return {
        logs,
        count: logs.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('logs/stats')
  @ApiOperation({ summary: 'Get logging statistics' })
  @ApiResponse({ status: 200, description: 'Logging statistics' })
  async getLogStats() {
    try {
      const stats = await this.logging.getLogStats();
      return {
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('queue')
  @ApiOperation({ summary: 'Get queue information' })
  @ApiResponse({ status: 200, description: 'Queue information' })
  async getQueueInfo(@Query('networkId') networkId?: 'L' | 'T') {
    try {
      if (networkId) {
        const length = await this.queue.getQueueLength(networkId);
        const entries = await this.queue.peekQueue(networkId, 10);

        return {
          networkId,
          length,
          entries,
          timestamp: new Date().toISOString(),
        };
      } else {
        const mainnetLength = await this.queue.getQueueLength('L');
        const testnetLength = await this.queue.getQueueLength('T');
        const isEmpty = await this.queue.isQueueEmpty();
        const canProcess = await this.queue.canProcessNewEntry();
        const processing = await this.queue.getProcessingEntries();

        return {
          mainnet: {
            length: mainnetLength,
            entries: await this.queue.peekQueue('L', 5),
          },
          testnet: {
            length: testnetLength,
            entries: await this.queue.peekQueue('T', 5),
          },
          isEmpty,
          canProcessNewEntry: canProcess,
          processing,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('queue/status/:requestId')
  @ApiOperation({ summary: 'Get status of a specific request' })
  @ApiResponse({ status: 200, description: 'Request status information' })
  async getRequestStatus(
    @Param('requestId') requestId: string,
    @Query('networkId') networkId: 'L' | 'T' = 'L',
  ) {
    try {
      const status = await this.queue.getStatus(networkId, requestId);
      const logs = await this.logging.getLogsByRid(requestId);

      return {
        requestId,
        networkId,
        status,
        logs: logs.slice(0, 50), // Limit logs for response
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('keys')
  @ApiOperation({ summary: 'Get Redis keys matching pattern' })
  @ApiResponse({ status: 200, description: 'Redis keys' })
  async getKeys(@Query('pattern') pattern: string = '*') {
    try {
      const keys = await this.redis.keys(pattern);

      return {
        pattern,
        keys,
        count: keys.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('memory')
  @ApiOperation({ summary: 'Get Redis memory usage' })
  @ApiResponse({ status: 200, description: 'Memory usage information' })
  async getMemoryUsage() {
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

      return {
        memory: memoryInfo,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('ping')
  @ApiOperation({ summary: 'Ping Redis server' })
  @ApiResponse({ status: 200, description: 'Ping response' })
  async ping() {
    try {
      const start = Date.now();
      const pong = await this.redis.ping();
      const latency = Date.now() - start;

      return {
        response: pong,
        latency: `${latency}ms`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
