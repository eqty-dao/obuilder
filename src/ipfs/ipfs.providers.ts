import { ConfigService } from '../config/config.service';
import { Provider } from '@nestjs/common';

export const ipfsProviders: Array<Provider> = [
  {
    provide: 'IPFS',
    useFactory: async (config: ConfigService): Promise<any> => {
      await config.load();
      // Return a mock IPFS instance since we're not using IPFS
      return {
        add: async () => ({ path: 'mock-cid' }),
        cat: async () => Buffer.from('mock-data'),
        pin: {
          add: async () => ({ cid: 'mock-cid' }),
          rm: async () => ({ cid: 'mock-cid' }),
        },
        stop: async () => {},
      };
    },
    inject: [ConfigService],
  },
];
