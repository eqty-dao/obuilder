import { Module } from '@nestjs/common';
import { NFTService } from './nft.service';
import { EthersModule } from '../ethers/ethers.module';

@Module({
  imports: [EthersModule],
  providers: [NFTService],
  exports: [NFTService],
})
export class NFTModule {}
