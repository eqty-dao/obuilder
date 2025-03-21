import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { ConfigModule } from '../config/config.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { S3Module } from '../s3/s3.module';

import { LoggingModule } from '../logging/logging.module';
@Module({
  imports: [ConfigModule, TelegramBotModule, S3Module, LoggingModule],

  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
