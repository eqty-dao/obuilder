import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { ConfigModule } from 'src/config/config.module';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { S3Module } from 'src/s3/s3.module';
import { S3Service } from 'src/s3/s3.service';
import { CoinmarketcapModule } from 'src/coinmarketcap/coinmarketcap.module';
import { CoinmarketcapService } from 'src/coinmarketcap/coinmarketcap.service';

@Module({
  imports: [ConfigModule, TelegramBotModule, S3Module, CoinmarketcapModule],
//   providers: [QueueService, TelegramBotService, S3Service, CoinmarketcapService]
  providers: [QueueService, TelegramBotService, S3Service],
  exports: [QueueService],
})
export class QueueModule {}
