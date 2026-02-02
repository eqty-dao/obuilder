import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { QueueService } from './queue/queue.service';
import { QueueModule } from './queue/queue.module';
import { ConfigModule } from './config/config.module';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { LoggingService } from './logging/logging.service';
import { EqtyModule } from './eqty/eqty.module';
import { LoggingModule } from './logging/logging.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from './config/config.service';
import { UploadZipService } from './upload-zip/upload-zip.service';
import { NFTModule } from './nft/nft.module';
import { NFTService } from './nft/nft.service';
import { IpfsModule } from './ipfs/ipfs.module';
import { EthersService } from './ethers/ethers.service';
import { S3Module } from './s3/s3.module';
import { S3Service } from './s3/s3.service';
import { CoinmarketcapModule } from './coinmarketcap/coinmarketcap.module';
import { CoinmarketcapService } from 'src/coinmarketcap/coinmarketcap.service';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { EIP712Guard } from './guards/eip712.guard';
import { EqtyService } from './eqty/eqty.service';

@Module({
  imports: [
    // Rate limiting: 60 requests per minute
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    ConfigModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      }),
    }),
    UploadZipModule,
    IpfsModule,
    NFTModule,
    CoinmarketcapModule,
    QueueModule,
    TelegramBotModule,
    LoggingModule,
    S3Module,
    EqtyModule,
  ],
  controllers: [AppController],
  providers: [
    // Global exception filter for centralized error handling
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global EIP-712 authentication guard
    {
      provide: APP_GUARD,
      useClass: EIP712Guard,
    },
    AppService, UploadZipService, NFTService, EqtyService, S3Service, QueueService, CoinmarketcapService, TelegramBotService, LoggingService, EthersService
  ]
})
export class AppModule { }
