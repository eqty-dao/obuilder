import { LTO } from '@ltonetwork/lto';
import { ConfigService } from '../config/config.service';
import { Provider } from '@nestjs/common';

export const ltoProviders: Array<Provider> = [
  {
    provide: LTO,
    useFactory: (config: ConfigService) => {
      // const nodeAddress = config.get<string>('LTO_NODE');
      // const networkId = config.get<string>('LTO_NETWORK_ID');
      const nodeAddress = config.lto.node;
      const networkId = config.lto.networkId;
      console.log('LTO_NODE:', nodeAddress);
      console.log('LTO_NETWORK_ID:', networkId);

      const lto = new LTO(networkId);
      lto.nodeAddress = nodeAddress;
      return lto;
    },
    inject: [ConfigService],
  },
];
