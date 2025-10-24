import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadZipModule } from './upload-zip/upload-zip.module';
import { QueueModule } from './queue/queue.module';
import { ConfigModule } from './config/config.module'; // Use custom ConfigModule
// import { VerifySignatureMiddleware } from './common/http-signature/verify-signature.middleware';

import { TelegramBotModule } from './telegram-bot/telegram-bot.module';

import { EqtyModule } from './eqty/eqty.module';

import { LoggingModule } from './logging/logging.module';

import { NFTModule } from './nft/nft.module';

import { IpfsModule } from './ipfs/ipfs.module';

import { S3Module } from './s3/s3.module';

import { CoinmarketcapModule } from './coinmarketcap/coinmarketcap.module';

import { FileManagementModule } from './file-management/file-management.module';
import { EventChainModule } from './event-chain/event-chain.module';
import { RelayModule } from './relay/relay.module';
import { PinataModule } from './pinata/pinata.module';
import { RedisModule } from './redis/redis.module';
import { RedisMonitoringModule } from './redis/redis-monitoring.module';

@Module({
  imports: [
    RedisModule, // Redis must be imported first as it's global
    FileManagementModule,
    ConfigModule,
    LoggingModule, // LoggingModule must be imported before modules that depend on it
    RelayModule,
    EventChainModule,
    PinataModule,
    UploadZipModule,
    EqtyModule,
    IpfsModule,
    NFTModule,
    CoinmarketcapModule,
    QueueModule,
    TelegramBotModule,
    S3Module,
    RedisMonitoringModule, // Add monitoring module after all dependencies are loaded
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(VerifySignatureMiddleware).forRoutes({ path: 'api/v1/*', method: RequestMethod.ALL });
  // }
}
