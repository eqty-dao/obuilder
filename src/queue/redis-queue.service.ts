import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LoggingService } from '../logging/redis-logging.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { NftInfo } from '../interfaces/OwnableInfo';
import { format } from 'date-fns';

@Injectable()
export class RedisQueueService implements OnModuleInit {
  private readonly logger = new Logger(RedisQueueService.name);
  private readonly QUEUE_PREFIX = 'queue';
  private readonly STATUS_PREFIX = 'status';
  private readonly TEMPLATE_COSTS_PREFIX = 'template_costs';

  constructor(
    private readonly redis: RedisService,
    private readonly loggingService: LoggingService,
    private readonly telegramService: TelegramBotService,
  ) {}

  async onModuleInit() {
    try {
      // Initialize template costs
      await this.initializeTemplateCosts();
      this.logger.log('Redis Queue Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis Queue Service:', error);
      throw error;
    }
  }

  // Queue Operations
  async enqueue(networkId: 'L' | 'T', entry: QueueEntry): Promise<void> {
    try {
      const queueName = this.getQueueName(networkId);
      const statusKey = this.getStatusKey(networkId, entry.rid);

      // Set initial status
      entry.ownableStatus = OwnableStatus.InQueue;
      entry.timestampInQueue = Math.floor(Date.now() / 1000);

      // Store in queue
      await this.redis.enqueue(queueName, entry);

      // Store status separately for quick access
      await this.redis.set(statusKey, {
        status: entry.ownableStatus,
        timestamp: entry.timestampInQueue,
        templateId: entry.templateId,
      });

      // Publish queue update
      await this.redis.publish('queue:updates', {
        networkId,
        action: 'enqueued',
        rid: entry.rid,
        status: entry.ownableStatus,
        timestamp: entry.timestampInQueue,
      });

      await this.loggingService.log(
        entry.rid,
        `Request enqueued on ${networkId} network`,
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue request ${entry.rid}:`, error);
      throw error;
    }
  }

  async dequeue(
    networkId: 'L' | 'T',
    timeout: number = 10,
  ): Promise<QueueEntry | null> {
    try {
      const queueName = this.getQueueName(networkId);
      const entry = await this.redis.dequeue(queueName, timeout);

      if (entry) {
        await this.loggingService.log(
          entry.rid,
          `Request dequeued from ${networkId} network`,
        );

        // Publish queue update
        await this.redis.publish('queue:updates', {
          networkId,
          action: 'dequeued',
          rid: entry.rid,
          status: entry.ownableStatus,
        });
      }

      return entry;
    } catch (error) {
      this.logger.error(`Failed to dequeue from ${networkId} network:`, error);
      throw error;
    }
  }

  async updateStatus(
    networkId: 'L' | 'T',
    requestId: string,
    status: OwnableStatus,
    hash?: string,
  ): Promise<void> {
    try {
      const statusKey = this.getStatusKey(networkId, requestId);
      const timestamp = Math.floor(Date.now() / 1000);

      // Update status
      await this.redis.hset(statusKey, 'status', status);
      await this.redis.hset(statusKey, 'timestamp', timestamp);

      // Set specific timestamp based on status
      const timestampField = this.getTimestampField(status);
      if (timestampField) {
        await this.redis.hset(statusKey, timestampField, timestamp);
      }

      // Update hash if provided
      if (hash) {
        await this.redis.hset(statusKey, 'hash', hash);
      }

      // Publish status update
      await this.redis.publish('queue:updates', {
        networkId,
        action: 'status_updated',
        rid: requestId,
        status,
        timestamp,
        hash,
      });

      await this.loggingService.log(
        requestId,
        `Status updated to ${OwnableStatus[status]} on ${networkId} network`,
      );

      // Handle specific status actions
      if (status === OwnableStatus.Ready) {
        await this.handleReadyStatus(networkId, requestId);
      } else if (status === OwnableStatus.Failed) {
        await this.handleFailedStatus(networkId, requestId);
      }
    } catch (error) {
      this.logger.error(`Failed to update status for ${requestId}:`, error);
      throw error;
    }
  }

  async getStatus(networkId: 'L' | 'T', requestId: string): Promise<any> {
    try {
      const statusKey = this.getStatusKey(networkId, requestId);
      return await this.redis.hgetall(statusKey);
    } catch (error) {
      this.logger.error(`Failed to get status for ${requestId}:`, error);
      return null;
    }
  }

  async getQueueLength(networkId: 'L' | 'T'): Promise<number> {
    try {
      const queueName = this.getQueueName(networkId);
      return await this.redis.queueLength(queueName);
    } catch (error) {
      this.logger.error(`Failed to get queue length for ${networkId}:`, error);
      return 0;
    }
  }

  async peekQueue(
    networkId: 'L' | 'T',
    count: number = 5,
  ): Promise<QueueEntry[]> {
    try {
      const queueName = this.getQueueName(networkId);
      return await this.redis.peekQueue(queueName, count);
    } catch (error) {
      this.logger.error(`Failed to peek queue for ${networkId}:`, error);
      return [];
    }
  }

  async isQueueEmpty(networkId?: 'L' | 'T'): Promise<boolean> {
    try {
      if (networkId) {
        const length = await this.getQueueLength(networkId);
        return length === 0;
      } else {
        const mainnetLength = await this.getQueueLength('L');
        const testnetLength = await this.getQueueLength('T');
        return mainnetLength === 0 && testnetLength === 0;
      }
    } catch (error) {
      this.logger.error('Failed to check if queue is empty:', error);
      return true;
    }
  }

  async canProcessNewEntry(): Promise<boolean> {
    try {
      // Check if any entries are currently processing or ready
      const processingKeys = await this.redis.keys(
        `${this.STATUS_PREFIX}:*:processing`,
      );
      const readyKeys = await this.redis.keys(`${this.STATUS_PREFIX}:*:ready`);

      return processingKeys.length === 0 && readyKeys.length === 0;
    } catch (error) {
      this.logger.error('Failed to check if can process new entry:', error);
      return false;
    }
  }

  async getProcessingEntries(): Promise<
    Array<{ networkId: 'L' | 'T'; requestId: string; status: any }>
  > {
    try {
      const processingKeys = await this.redis.keys(
        `${this.STATUS_PREFIX}:*:processing`,
      );
      const entries = [];

      for (const key of processingKeys) {
        const parts = key.split(':');
        const networkId = parts[1] as 'L' | 'T';
        const requestId = parts[2];
        const status = await this.redis.hgetall(key);

        entries.push({ networkId, requestId, status });
      }

      return entries;
    } catch (error) {
      this.logger.error('Failed to get processing entries:', error);
      return [];
    }
  }

  // Template Costs Management
  async setTemplateCosts(
    networkId: 'L' | 'T',
    evmNetwork: string,
    templateId: string,
    lastValue: number,
    prevValue: number,
    usdValue: number,
  ): Promise<void> {
    try {
      const costsKey = `${this.TEMPLATE_COSTS_PREFIX}:${networkId}:${evmNetwork}`;

      await this.redis.hset(costsKey, templateId, JSON.stringify({
        last: lastValue.toString(),
        prev: prevValue.toString(),
        usd: usdValue.toString(),
        timestamp: Math.floor(Date.now() / 1000),
      }));

      await this.loggingService.log(
        'system',
        `Template costs updated for ${networkId}:${evmNetwork}:${templateId}`,
      );
    } catch (error) {
      this.logger.error('Failed to set template costs:', error);
      throw error;
    }
  }

  async getTemplateCosts(
    networkId: 'L' | 'T',
    evmNetwork: string,
  ): Promise<any> {
    try {
      const costsKey = `${this.TEMPLATE_COSTS_PREFIX}:${networkId}:${evmNetwork}`;
      return await this.redis.hgetall(costsKey);
    } catch (error) {
      this.logger.error('Failed to get template costs:', error);
      return {};
    }
  }

  async getTemplateCostsIncludingPrevious(
    networkId: 'L' | 'T',
    evmNetwork: string,
    templateId: string,
  ): Promise<any> {
    try {
      const costsKey = `${this.TEMPLATE_COSTS_PREFIX}:${networkId}:${evmNetwork}`;
      const costs = await this.redis.hgetall(costsKey);

      // Get specific template costs
      const templateCosts = costs[templateId] ? JSON.parse(costs[templateId]) : {};

      // Add previous costs if they exist
      const previousCostsKey = `${this.TEMPLATE_COSTS_PREFIX}:${networkId}:${evmNetwork}:previous`;
      const previousCosts = await this.redis.hgetall(previousCostsKey);
      const templatePreviousCosts = previousCosts[templateId] ? JSON.parse(previousCosts[templateId]) : {};

      return {
        templateId: templateId,
        current: templateCosts,
        previous: templatePreviousCosts,
        all: costs,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get template costs including previous:',
        error,
      );
      return {};
    }
  }

  async getQueueEntriesByStatus(status: OwnableStatus): Promise<QueueEntry[]> {
    try {
      const pattern = `${this.STATUS_PREFIX}:*`;
      const keys = await this.redis.keys(pattern);
      const entries: QueueEntry[] = [];

      for (const key of keys) {
        const statusData = await this.redis.hgetall(key);
        if (statusData.status === status) {
          const networkId = key.split(':')[1] as 'L' | 'T';
          const requestId = key.split(':')[2];

          // Get queue entry data
          const queueKey = `${this.QUEUE_PREFIX}:${networkId}:${requestId}`;
          const queueData = await this.redis.hgetall(queueKey);

          if (queueData.requestId) {
            entries.push({
              requestId: queueData.requestId,
              networkId: networkId,
              status: statusData.status as OwnableStatus,
              templateId: queueData.templateId || '',
              sender: queueData.sender || '',
              transactionId: queueData.transactionId || '',
              timestamp: new Date(queueData.timestamp || Date.now()),
              nftInfo: queueData.nftInfo ? JSON.parse(queueData.nftInfo) : null,
            });
          }
        }
      }

      return entries;
    } catch (error) {
      this.logger.error('Failed to get queue entries by status:', error);
      return [];
    }
  }

  // Legacy properties for compatibility (not used in Redis implementation)
  get queueMainnet(): QueueEntry[] {
    return [];
  }

  get queueTestnet(): QueueEntry[] {
    return [];
  }

  async setCidNftInfo(
    networkId: 'L' | 'T',
    requestId: string,
    cid: string,
    nftInfo: NftInfo,
    nftTokenUri: string,
  ): Promise<void> {
    try {
      const queueKey = `${this.QUEUE_PREFIX}:${networkId}:${requestId}`;
      const statusKey = this.getStatusKey(networkId, requestId);

      // Update queue entry with CID and NFT info
      await this.redis.hset(queueKey, 'cid', cid);
      await this.redis.hset(queueKey, 'nftInfo', JSON.stringify(nftInfo));
      await this.redis.hset(queueKey, 'nftTokenUri', nftTokenUri);

      // Update status entry with CID
      await this.redis.hset(statusKey, 'cid', cid);
      await this.redis.hset(statusKey, 'nftTokenUri', nftTokenUri);

      this.logger.log(
        `Updated CID and NFT info for ${networkId}:${requestId} - CID: ${cid}`,
      );
    } catch (error) {
      this.logger.error('Failed to set CID and NFT info:', error);
      throw error;
    }
  }

  async updateQueueInS3Bucket(networkId: 'L' | 'T'): Promise<void> {
    // Redis implementation doesn't use S3, so this is a no-op
    this.logger.log(
      `updateQueueInS3Bucket called for ${networkId} - Redis implementation doesn't use S3`,
    );
  }

  async setQueueEntryStatus(
    networkId: 'L' | 'T',
    requestId: string,
    status: OwnableStatus,
  ): Promise<void> {
    try {
      const statusKey = this.getStatusKey(networkId, requestId);
      await this.redis.hset(statusKey, 'status', status);

      // Update timestamp based on status
      const timestamp = Date.now();
      switch (status) {
        case OwnableStatus.InQueue:
          await this.redis.hset(statusKey, 'timestampInQueue', timestamp);
          break;
        case OwnableStatus.Processing:
          await this.redis.hset(statusKey, 'timestampProcessing', timestamp);
          break;
        case OwnableStatus.Ready:
          await this.redis.hset(statusKey, 'timestampReady', timestamp);
          break;
        case OwnableStatus.Sent:
          await this.redis.hset(statusKey, 'timestampSent', timestamp);
          break;
        case OwnableStatus.Failed:
          await this.redis.hset(statusKey, 'timestampFailed', timestamp);
          break;
      }

      this.logger.log(
        `Updated queue entry status: ${networkId}:${requestId} -> ${status}`,
      );
    } catch (error) {
      this.logger.error('Failed to set queue entry status:', error);
      throw error;
    }
  }

  async getQueueEntryByRequestId(
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<[QueueEntry, number]> {
    try {
      const queueKey = `${this.QUEUE_PREFIX}:${networkId}:${requestId}`;
      const queueData = await this.redis.hgetall(queueKey);

      if (queueData.requestId) {
        const entry: QueueEntry = {
          requestId: queueData.requestId,
          networkId: networkId,
          status: queueData.status as OwnableStatus,
          templateId: queueData.templateId || '',
          sender: queueData.sender || '',
          transactionId: queueData.transactionId || '',
          timestamp: new Date(queueData.timestamp || Date.now()),
          nftInfo: queueData.nftInfo ? JSON.parse(queueData.nftInfo) : null,
        };

        // For Redis implementation, we don't have array indices, so return 0
        return [entry, 0];
      }

      return [null, -1];
    } catch (error) {
      this.logger.error('Failed to get queue entry by request ID:', error);
      return [null, -1];
    }
  }

  async isCreatingOwnable(): Promise<'L' | 'T' | null> {
    try {
      // Check if there are any entries currently being processed
      const processingEntries = await this.getQueueEntriesByStatus(
        OwnableStatus.Processing,
      );

      if (processingEntries.length > 0) {
        // Return the network ID of the first processing entry
        return processingEntries[0].networkId;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to check if creating ownable:', error);
      return null;
    }
  }

  // Queue Management
  async processNextQueueEntry(): Promise<
    | ['L' | 'T', string, Uint8Array, string, boolean, string, NftInfo]
    | [null, null, null, null, null, null, null]
  > {
    try {
      // Try mainnet first, then testnet
      for (const networkId of ['L', 'T'] as const) {
        const entry = await this.dequeue(networkId, 1);
        if (entry) {
          await this.updateStatus(
            networkId,
            entry.rid,
            OwnableStatus.Processing,
          );

          return [
            networkId,
            entry.rid,
            Buffer.from(entry.data, 'base64'),
            entry.ltoWallet,
            entry.reenqueued,
            entry.reenqueued_NFTURI,
            entry.nftInfo,
          ];
        }
      }

      return [null, null, null, null, null, null, null];
    } catch (error) {
      this.logger.error('Failed to process next queue entry:', error);
      throw error;
    }
  }

  async ownableFailed(
    networkId: 'L' | 'T',
    requestId: string,
    errMsg: string,
  ): Promise<void> {
    try {
      await this.updateStatus(networkId, requestId, OwnableStatus.Failed);

      // Store error message
      const statusKey = this.getStatusKey(networkId, requestId);
      await this.redis.hset(statusKey, 'error', errMsg);

      await this.loggingService.logError(
        requestId,
        `Ownable creation failed: ${errMsg}`,
      );

      // Send Telegram notification
      try {
        const message =
          `❌ Ownable creation failed\n\n` +
          `Request ID: ${requestId}\n` +
          `Network: ${networkId}\n` +
          `Error: ${errMsg}\n` +
          `Time: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`;

        await this.telegramService.sendMessageToTelegramBot(networkId, message);
      } catch (telegramError) {
        this.logger.error(
          'Failed to send Telegram notification:',
          telegramError,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle ownable failure for ${requestId}:`,
        error,
      );
      throw error;
    }
  }

  // Private Helper Methods
  private getQueueName(networkId: 'L' | 'T'): string {
    return `${this.QUEUE_PREFIX}:${networkId}`;
  }

  private getStatusKey(networkId: 'L' | 'T', requestId: string): string {
    return `${this.STATUS_PREFIX}:${networkId}:${requestId}`;
  }

  private getTimestampField(status: OwnableStatus): string | null {
    switch (status) {
      case OwnableStatus.Processing:
        return 'timestampProcessing';
      case OwnableStatus.Ready:
        return 'timestampReady';
      case OwnableStatus.Sent:
        return 'timestampSent';
      case OwnableStatus.Failed:
        return 'timestampFailed';
      default:
        return null;
    }
  }

  private async handleReadyStatus(
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<void> {
    try {
      const message =
        `✅ Ownable ready for delivery\n\n` +
        `Request ID: ${requestId}\n` +
        `Network: ${networkId}\n` +
        `Time: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`;

      await this.telegramService.sendMessageToTelegramBot(networkId, message);
    } catch (error) {
      this.logger.error('Failed to send ready notification:', error);
    }
  }

  private async handleFailedStatus(
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<void> {
    try {
      const message =
        `❌ Ownable creation failed\n\n` +
        `Request ID: ${requestId}\n` +
        `Network: ${networkId}\n` +
        `Time: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`;

      await this.telegramService.sendMessageToTelegramBot(networkId, message);
    } catch (error) {
      this.logger.error('Failed to send failure notification:', error);
    }
  }

  private async initializeTemplateCosts(): Promise<void> {
    try {
      // Initialize default template costs for both networks
      const defaultCosts = {
        arbitrum: {
          '1': { last: '20000000', prev: '20000000', usd: '50.00' },
          '2': { last: '20000000', prev: '20000000', usd: '50.00' },
          '3': { last: '20000000', prev: '20000000', usd: '50.00' },
        },
        base: {
          '1': { last: '20000000', prev: '20000000', usd: '50.00' },
          '2': { last: '20000000', prev: '20000000', usd: '50.00' },
          '3': { last: '20000000', prev: '20000000', usd: '50.00' },
        },
      };

      for (const networkId of ['L', 'T'] as const) {
        for (const [evmNetwork, templates] of Object.entries(defaultCosts)) {
          for (const [templateId, costs] of Object.entries(templates)) {
            await this.setTemplateCosts(
              networkId,
              evmNetwork,
              templateId,
              parseInt(costs.last),
              parseInt(costs.prev),
              parseFloat(costs.usd),
            );
          }
        }
      }

      this.logger.log('Template costs initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize template costs:', error);
    }
  }

  // Health Check
  async healthCheck(): Promise<{
    status: string;
    queues: { mainnet: number; testnet: number };
    processing: number;
    redisConnected: boolean;
  }> {
    try {
      const redisHealth = await this.redis.healthCheck();
      const mainnetLength = await this.getQueueLength('L');
      const testnetLength = await this.getQueueLength('T');
      const processingEntries = await this.getProcessingEntries();

      return {
        status: redisHealth.status === 'healthy' ? 'healthy' : 'degraded',
        queues: {
          mainnet: mainnetLength,
          testnet: testnetLength,
        },
        processing: processingEntries.length,
        redisConnected: redisHealth.status === 'healthy',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        queues: { mainnet: 0, testnet: 0 },
        processing: 0,
        redisConnected: false,
      };
    }
  }
}
