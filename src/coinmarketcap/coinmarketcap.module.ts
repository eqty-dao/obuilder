import { Module, forwardRef } from '@nestjs/common';
import { CoinmarketcapService } from './coinmarketcap.service';
import { ConfigModule } from '../config/config.module';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { LoggingModule } from 'src/logging/logging.module';
import { S3Module } from 'src/s3/s3.module';
import { QueueModule } from 'src/queue/queue.module';


@Module({
	imports: [ConfigModule,TelegramBotModule,LoggingModule,S3Module,forwardRef(() => QueueModule)],
  providers: [CoinmarketcapService],
  exports: [CoinmarketcapService]
})
export class CoinmarketcapModule {}
