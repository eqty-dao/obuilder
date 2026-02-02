import { Module } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { UploadZipController } from './upload-zip.controller';
import { ConfigModule } from '../config/config.module';
import { HttpModule } from '@nestjs/axios';
import { EqtyModule } from 'src/eqty/eqty.module';
import { NFTModule } from 'src/nft/nft.module';
import { QueueService } from 'src/queue/queue.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { LoggingService } from 'src/logging/logging.service';
import { ConfigService } from '../config/config.service';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { LoggingModule } from 'src/logging/logging.module';
import { IpfsModule } from 'src/ipfs/ipfs.module';
import { S3Module } from 'src/s3/s3.module';
import { S3Service } from 'src/s3/s3.service';
import { CoinmarketcapModule } from 'src/coinmarketcap/coinmarketcap.module';
import { CoinmarketcapService } from 'src/coinmarketcap/coinmarketcap.service';
import { QueueModule } from 'src/queue/queue.module';
import { EqtyService } from 'src/eqty/eqty.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      }),
    }),
    ConfigModule,
    NFTModule,
    TelegramBotModule,
    QueueModule,
    CoinmarketcapModule,
    LoggingModule,
    EqtyModule,
    IpfsModule,
    S3Module
  ],
  providers: [
    UploadZipService, QueueService, TelegramBotService, S3Service, LoggingService, EqtyService, CoinmarketcapService
  ],
  controllers: [UploadZipController],
  exports: [
    UploadZipService
  ],
})
export class UploadZipModule { }