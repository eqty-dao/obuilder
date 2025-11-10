import { ConfigService } from '../config/config.service';
import { Provider } from '@nestjs/common';

export const ipfsProviders: Array<Provider> = [
  {
    provide: 'IPFS',
    useFactory: async (config: ConfigService): Promise<IPFS> => {
      await config.load();
      const IPFSModule = await import('ipfs-core');
      // Configure IPFS without libp2p networking since we only need CID calculation
      return await IPFSModule.create({
        start: false,
        libp2p: {
          start: false,
        },
      });
    },
    inject: [ConfigService],
  },
];
