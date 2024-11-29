import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { ConfigModule } from 'src/config/config.module';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';

@Module({
  imports: [ConfigModule, TelegramBotModule],
  providers: [S3Service, TelegramBotService],
  exports:[S3Service]
})
export class S3Module {}
