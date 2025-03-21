import { Module } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { ConfigModule } from '../config/config.module';
import { S3Module } from '../s3/s3.module';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';

@Module({
  imports: [ConfigModule, S3Module, TelegramBotModule],
  providers: [LoggingService],
  exports: [LoggingService]
})
export class LoggingModule {}
