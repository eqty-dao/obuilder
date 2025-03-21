import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { ConfigModule } from '../config/config.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
// import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

@Module({
  imports: [ConfigModule, TelegramBotModule],
  providers: [S3Service],
  exports:[S3Service]
})
export class S3Module {}
