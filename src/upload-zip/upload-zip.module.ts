import { Module } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { FileManagementModule } from '../file-management/file-management.module';
import { UploadZipController } from './upload-zip.controller';
import { ConfigModule } from '../config/config.module'; // Ensure custom config module
import { HttpModule, HttpService } from '@nestjs/axios';
import { LtoModule } from '../lto/lto.module';
import { NFTModule } from '../nft/nft.module';

import { ConfigService } from '../config/config.service'; // Custom ConfigService
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { LoggingModule } from '../logging/logging.module';

import { IpfsModule } from '../ipfs/ipfs.module';
import { S3Module } from '../s3/s3.module';

import { CoinmarketcapModule } from '../coinmarketcap/coinmarketcap.module';

import { QueueModule } from '../queue/queue.module';
import { EventChainModule } from '../event-chain/event-chain.module';
import { RelayModule } from '../relay/relay.module';
import { PinataModule } from '../pinata/pinata.module';
import { ApiKeyGuard } from '../guards/api-key.guard';
@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      }),
    }),
	EventChainModule,
	RelayModule,
	PinataModule,
	FileManagementModule,
    ConfigModule, 
    NFTModule,
    TelegramBotModule,
	QueueModule,
	CoinmarketcapModule,
    LoggingModule,
    LtoModule,
    IpfsModule,
    S3Module
  ],
  providers: [
    UploadZipService,
	ApiKeyGuard
  ],
  controllers: [UploadZipController],
  exports: [
    UploadZipService
  ],
})
export class UploadZipModule {}