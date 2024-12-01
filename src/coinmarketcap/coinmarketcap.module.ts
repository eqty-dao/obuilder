import { Module } from '@nestjs/common';
import { CoinmarketcapService } from './coinmarketcap.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { ConfigModule } from 'src/config/config.module';
import { QueueService } from 'src/queue/queue.service';
import { S3Service } from 'src/s3/s3.service';

// import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';

@Module({
	imports: [ConfigModule],
  providers: [CoinmarketcapService, TelegramBotService, QueueService, S3Service],
  exports: [CoinmarketcapService]
})
export class CoinmarketcapModule {}
