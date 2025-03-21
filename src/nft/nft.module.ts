import { Module } from '@nestjs/common';
import { NFTService } from './nft.service';
import { EthersModule } from '../ethers/ethers.module';
import { ConfigModule } from '../config/config.module';
import { LoggingModule } from '../logging/logging.module';
import { QueueModule } from '../queue/queue.module';
import { CoinmarketcapModule } from '../coinmarketcap/coinmarketcap.module';
@Module({
  imports: [
    EthersModule,
    ConfigModule,
    LoggingModule,
    QueueModule,
	CoinmarketcapModule
  ],
  providers: [NFTService],
  exports: [NFTService],
})
export class NFTModule {}
