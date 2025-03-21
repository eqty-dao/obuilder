import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { QueueModule } from './queue/queue.module';
import { ConfigModule } from './config/config.module'; // Use custom ConfigModule
// import { VerifySignatureMiddleware } from './common/http-signature/verify-signature.middleware';

import { TelegramBotModule } from './telegram-bot/telegram-bot.module';

import { LtoModule } from './lto/lto.module';

import { LoggingModule } from './logging/logging.module';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from './config/config.service';

import { NFTModule } from './nft/nft.module';

import { IpfsModule } from './ipfs/ipfs.module';

import { S3Module } from './s3/s3.module';

import { CoinmarketcapModule } from './coinmarketcap/coinmarketcap.module';

import { FileManagementModule } from './file-management/file-management.module';
import { EventChainModule } from './event-chain/event-chain.module';
import { RelayModule } from './relay/relay.module';
import { PinataModule } from './pinata/pinata.module';

@Module({
  imports: [
	FileManagementModule,
    ConfigModule, // Use custom ConfigModule without forRoot()
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      }),
    }),
    // ConfigModule.forRoot({ isGlobal: true }),
	RelayModule,
	EventChainModule,
	PinataModule,
    UploadZipModule,
    LtoModule,    
    IpfsModule,
    NFTModule,
    CoinmarketcapModule,
    QueueModule,
    TelegramBotModule,
    LoggingModule,
    S3Module,
  ],
  controllers: [AppController],
  providers: [AppService]  
})
export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(VerifySignatureMiddleware).forRoutes({ path: 'api/v1/*', method: RequestMethod.ALL });
  // }
}
