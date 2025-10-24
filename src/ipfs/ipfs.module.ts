import { Inject, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ipfsProviders } from './ipfs.providers';
import { ConfigService } from '../config/config.service';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [...ipfsProviders],
  exports: [...ipfsProviders],
})
export class IpfsModule {
  constructor(
    @Inject('IPFS') private readonly ipfs: IPFS,
    private readonly config: ConfigService,
  ) {}
}
