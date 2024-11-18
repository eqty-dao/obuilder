import { Module } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { UploadZipController } from './upload-zip.controller';
import { ConfigModule } from '../config/config.module'; // Ensure custom config module
import { HttpModule, HttpService } from '@nestjs/axios';
import { LtoModule } from 'src/lto/lto.module';
import { NFTModule } from 'src/nft/nft.module';
import { QueueService } from 'src/queue/queue.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { LoggingService } from 'src/logging/logging.service';
import { ConfigService } from '../config/config.service'; // Custom ConfigService
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { LoggingModule } from 'src/logging/logging.module';
import { LtoService } from 'src/lto/lto.service';
import { IpfsModule } from 'src/ipfs/ipfs.module';
import { S3Module } from 'src/s3/s3.module';
import { S3Service } from 'src/s3/s3.service';

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
    LoggingModule,
    LtoModule,
    IpfsModule,
    S3Module
  ],
  providers: [
    UploadZipService, QueueService, TelegramBotService, S3Service, LoggingService, LtoService
  ],
  controllers: [UploadZipController],
  exports: [
    UploadZipService
  ],
})
export class UploadZipModule {}