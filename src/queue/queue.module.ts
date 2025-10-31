import { Module } from '@nestjs/common';
import { RedisQueueService } from './redis-queue.service';
import { RedisModule } from '../redis/redis.module';
import { LoggingModule } from '../logging/logging.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [RedisModule, LoggingModule, TelegramBotModule, S3Module],
  providers: [RedisQueueService],
  exports: [RedisQueueService],
})
export class QueueModule {}
