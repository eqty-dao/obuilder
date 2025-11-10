import { ConfigService } from '../config/config.service';
import { Provider } from '@nestjs/common';

export const ipfsProviders: Array<Provider> = [
  {
    provide: 'IPFS',
    useFactory: async (config: ConfigService): Promise<any> => {
      await config.load();
      const IPFS = await import('ipfs-core');
      return await IPFS.create({ start: true });
    },
    inject: [ConfigService],
  },
];
