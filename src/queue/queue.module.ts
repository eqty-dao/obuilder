import { Module } from '@nestjs/common';
import { RedisQueueService } from './redis-queue.service';
import { RedisModule } from '../redis/redis.module';
import { LoggingModule } from '../logging/logging.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [RedisModule, LoggingModule, TelegramBotModule],
  providers: [RedisQueueService],
  exports: [RedisQueueService],
})
export class QueueModule {}
