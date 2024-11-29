import { Module } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { ConfigModule } from 'src/config/config.module';
import { S3Module } from 'src/s3/s3.module';
import { S3Service } from 'src/s3/s3.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';

@Module({
  imports: [ConfigModule, S3Module],
  providers: [LoggingService, S3Service, TelegramBotService],
  exports: [LoggingService]
})
export class LoggingModule {}
