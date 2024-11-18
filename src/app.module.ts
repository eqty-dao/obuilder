import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { QueueService } from './queue/queue.service';
import { QueueModule } from './queue/queue.module';
import { ConfigModule } from './config/config.module'; // Use custom ConfigModule
// import { VerifySignatureMiddleware } from './common/http-signature/verify-signature.middleware';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { LoggingService } from './logging/logging.service';
import { LtoModule } from './lto/lto.module';
import { LtoService } from './lto/lto.service';
import { LoggingModule } from './logging/logging.module';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from './config/config.service';
import { UploadZipService } from './upload-zip/upload-zip.service';
import { NFTModule } from './nft/nft.module';
import { NFTService } from './nft/nft.service';
import { IpfsModule } from './ipfs/ipfs.module';
import { EthereumService } from './nft/ethereum/ethereum.service';
import { EthersService } from './ethers/ethers.service';
import { S3Module } from './s3/s3.module';
import { S3Service } from './s3/s3.service';
@Module({
  imports: [
    ConfigModule, // Use custom ConfigModule without forRoot()
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 50000,
        maxRedirects: 5,
      }),
    }),
    // ConfigModule.forRoot({ isGlobal: true }),
    UploadZipModule,
    LtoModule,    
    IpfsModule,
    NFTModule,
    QueueModule,
    TelegramBotModule,
    LoggingModule,
    S3Module
  ],
  controllers: [AppController],
  providers: [AppService,  UploadZipService, NFTService, LtoService, S3Service, QueueService, TelegramBotService, LoggingService,  EthereumService, EthersService]  
})
export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(VerifySignatureMiddleware).forRoutes({ path: 'api/v1/*', method: RequestMethod.ALL });
  // }
}
