import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface LogEntry {
  requestId: string;
  level: string;
  message: string;
  metadata?: any;
  timestamp: string;
  service: string;
}

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);
  private readonly LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'];
  private readonly MAX_MEMORY_LOGS = 1000;
  private memoryLogs: LogEntry[] = [];

  constructor(private readonly redis: RedisService) {}

  async log(requestId: string, message: string, metadata?: any): Promise<void> {
    await this.addLogEntry(requestId, 'info', message, metadata);
  }

  async logError(
    requestId: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    await this.addLogEntry(requestId, 'error', message, metadata);
  }

  async logWarn(
    requestId: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    await this.addLogEntry(requestId, 'warn', message, metadata);
  }

  async logDebug(
    requestId: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    await this.addLogEntry(requestId, 'debug', message, metadata);
  }

  async logTrace(
    requestId: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    await this.addLogEntry(requestId, 'trace', message, metadata);
  }

  private async addLogEntry(
    requestId: string,
    level: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    try {
      // Validate log level
      if (!this.LOG_LEVELS.includes(level)) {
        level = 'info';
      }

      const logEntry: LogEntry = {
        requestId,
        level,
        message,
        metadata,
        timestamp: new Date().toISOString(),
        service: 'obuilder',
      };

      // Add to memory logs for immediate access
      this.memoryLogs.push(logEntry);

      // Rotate memory logs to prevent memory leaks
      if (this.memoryLogs.length > this.MAX_MEMORY_LOGS) {
        this.memoryLogs = this.memoryLogs.slice(-this.MAX_MEMORY_LOGS);
      }

      // Store in Redis for persistence
      await this.redis.addLog(requestId, level, message, metadata);

      // Console output with structured format
      const consoleMessage = `${level.toUpperCase()}: ${requestId}: ${message}`;
      if (metadata) {
        console.log(consoleMessage, metadata);
      } else {
        console.log(consoleMessage);
      }
    } catch (error) {
      // Fallback to console logging if Redis fails
      console.error(`Failed to log to Redis: ${error.message}`);
      console.log(`FALLBACK ${level.toUpperCase()}: ${requestId}: ${message}`);
    }
  }

  async getLogs(requestId?: string): Promise<LogEntry[]> {
    try {
      if (requestId) {
        return await this.redis.getLogs(requestId);
      } else {
        // Return memory logs for immediate access
        return [...this.memoryLogs].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      }
    } catch (error) {
      this.logger.error('Failed to retrieve logs:', error);
      return this.memoryLogs;
    }
  }

  async getLogsByRid(requestId: string): Promise<LogEntry[]> {
    try {
      return await this.redis.getLogs(requestId);
    } catch (error) {
      this.logger.error(`Failed to retrieve logs for ${requestId}:`, error);
      return this.memoryLogs.filter((log) => log.requestId === requestId);
    }
  }

  async getAllLogs(): Promise<LogEntry[]> {
    try {
      return await this.redis.getAllLogs();
    } catch (error) {
      this.logger.error('Failed to retrieve all logs:', error);
      return this.memoryLogs;
    }
  }

  async getLogsByLevel(level: string): Promise<LogEntry[]> {
    try {
      const allLogs = await this.getAllLogs();
      return allLogs.filter((log) => log.level === level);
    } catch (error) {
      this.logger.error(`Failed to retrieve logs by level ${level}:`, error);
      return this.memoryLogs.filter((log) => log.level === level);
    }
  }

  async getLogsByTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<LogEntry[]> {
    try {
      const allLogs = await this.getAllLogs();
      return allLogs.filter((log) => {
        const logTime = new Date(log.timestamp);
        return logTime >= startTime && logTime <= endTime;
      });
    } catch (error) {
      this.logger.error('Failed to retrieve logs by time range:', error);
      return this.memoryLogs.filter((log) => {
        const logTime = new Date(log.timestamp);
        return logTime >= startTime && logTime <= endTime;
      });
    }
  }

  async clearLogs(requestId?: string): Promise<void> {
    try {
      if (requestId) {
        // Clear specific request logs
        const logKey = `logs:${requestId}`;
        await this.redis.del(logKey);

        // Remove from memory logs
        this.memoryLogs = this.memoryLogs.filter(
          (log) => log.requestId !== requestId,
        );
      } else {
        // Clear all logs
        const keys = await this.redis.keys('logs:*');
        for (const key of keys) {
          await this.redis.del(key);
        }
        this.memoryLogs = [];
      }
    } catch (error) {
      this.logger.error('Failed to clear logs:', error);
    }
  }

  async getLogStats(): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByService: Record<string, number>;
    oldestLog?: string;
    newestLog?: string;
  }> {
    try {
      const allLogs = await this.getAllLogs();

      const stats = {
        totalLogs: allLogs.length,
        logsByLevel: {} as Record<string, number>,
        logsByService: {} as Record<string, number>,
        oldestLog: undefined as string | undefined,
        newestLog: undefined as string | undefined,
      };

      if (allLogs.length > 0) {
        // Count by level
        for (const log of allLogs) {
          stats.logsByLevel[log.level] =
            (stats.logsByLevel[log.level] || 0) + 1;
          stats.logsByService[log.service] =
            (stats.logsByService[log.service] || 0) + 1;
        }

        // Find oldest and newest
        const sortedLogs = allLogs.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        stats.oldestLog = sortedLogs[0].timestamp;
        stats.newestLog = sortedLogs[sortedLogs.length - 1].timestamp;
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get log stats:', error);
      return {
        totalLogs: this.memoryLogs.length,
        logsByLevel: {},
        logsByService: {},
      };
    }
  }

  // Health check for logging service
  async healthCheck(): Promise<{
    status: string;
    redisConnected: boolean;
    memoryLogs: number;
  }> {
    try {
      const redisHealth = await this.redis.healthCheck();
      return {
        status: redisHealth.status === 'healthy' ? 'healthy' : 'degraded',
        redisConnected: redisHealth.status === 'healthy',
        memoryLogs: this.memoryLogs.length,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        redisConnected: false,
        memoryLogs: this.memoryLogs.length,
      };
    }
  }
}
