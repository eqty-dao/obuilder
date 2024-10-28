// import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// import convict from 'convict';
// import { configurations, schema } from '../../config';

// type SchemaOf<T extends convict.Schema<any>> = T extends convict.Schema<infer R> ? R : any;
// type Schema = SchemaOf<typeof schema>;
// type Path = convict.Path<SchemaOf<typeof schema>>;
// type PathValue<K extends Path> = K extends null | undefined
//   ? Schema
//   : K extends convict.Path<Schema>
//   ? convict.PathValue<Schema, K>
//   : never;

// convict.addFormat({
//   name: 'typed-array',
//   validate: (items, schema) => {
//     if (!Array.isArray(items)) {
//       throw new Error('must be of type Array');
//     }

//     for (const item of items) {
//       convict(schema.children).load(item).validate();
//     }
//   },
// });

// @Injectable()
// export class ConfigService implements OnModuleInit, OnModuleDestroy {
//   private config: convict.Config<Schema>;
//   private readonly ttl: number = 300000; // 5 minutes in milliseconds
//   private reloadInterval: NodeJS.Timer;

//   async onModuleInit() {
//     if (!this.config) {
//       await this.load();
//     }

//     if (!this.reloadInterval) {
//       this.reloadInterval = setInterval(async () => {
//         await this.load();
//       }, this.ttl);
//     }
//   }

//   async onModuleDestroy() {
//     if (this.reloadInterval) {
//       // clearInterval(this.reloadInterval);
//     }
//   }

//   public async load(): Promise<void> {
//     const config = convict(schema);
//     const key = config.get('env');

//     if (key in configurations) {
//       config.load(configurations[key]);
//     }

//     await config.validate({ allowed: 'warn' });
//     this.config = config;
//   }

//   get<K extends Path>(key: K): PathValue<K> {
//     return this.config.get(key);
//   }

//   has(key: Path): boolean {
//     return this.config.has(key);
//   }
// }

import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { boolean } from 'boolean';
import { camelCase } from '../../utils/transform-case';
import fs from 'fs';

@Injectable()
export class ConfigService extends NestConfigService {
  public readonly app: { name: string; description: string; version: string };

  constructor() {
    super();
    try {
      const packageJson = fs.readFileSync('package.json', 'utf8');
      const { name, description, version } = JSON.parse(packageJson);
      this.app = { name: camelCase(name), description, version };
    } catch (error) {
      console.error('Failed to load package.json:', error);
      this.app = { name: '', description: '', version: '' };
    }
  }

  get auth() {
    const jwt_secret = this.get<string>('PINATA_JWT');
    return {
      jwt_secret,
    };
  }

  get api() {
    const prefix = this.get<string>('API_PREFIX');
    return {
      prefix,
      docs: prefix ? `/${prefix}/api-docs` : '/api-docs',
    };
  }

  get node() {
    const nodeEnv = this.get<string>('NODE_ENV') || 'development';
    return {
      env: nodeEnv,
      isEnv: (env: string | string[]) =>
        typeof env === 'string' ? env === nodeEnv : env.includes(nodeEnv),
    };
  }

  get port() {
    return Number(this.get<string>('PORT') || 3000);
  }

  get database() {
    const url = this.getOrThrow<string>('DATABASE_URL');
    const port = this.get<string>('DB_PORT');
    const password = this.get<string>('DB_PASSWORD');
    const synchronize =
      this.get<boolean>('DB_SYNCHRONIZE') ??
      (this.node.isEnv('development') || this.node.isEnv('test'));

    const parsedUrl = new URL(url);
    if (port) parsedUrl.port = port;
    if (password) parsedUrl.password = password;

    return {
      type: url.replace(/:.*$/, ''),
      url: parsedUrl.toString(),
      synchronize,
    };
  }

  get pinata() {
    return {
      jwt: this.get<string>('PINATA_JWT'),
      gateway: this.get<string>('PINATA_GATEWAY_URL'),
    };
  }

  get lto() {
    return {
      node: this.get<string>('LTO_NODE'),
      networkId: this.get<string>('LTO_NETWORK_ID'),
      account: {
        seed: this.get<string>('LTO_ACCOUNT_SEED'),
      },
      relay: this.get<string>('RELAY_SERVER'),
      localRelay: this.get<string>('LOCAL_RELAY_SERVER'),
      queue: this.get<boolean>('QUEUEING_ALLOWED', true),
    };
  }

  get eth() {
    return {
      account: {
        obridgeWalletAddress: this.get<string>('OBRIDGE_WALLET_ADDR'),
        mnemonic: this.get<string>('ACCOUNT_MNEMONIC'),
        arbitrumAlchemyApiKey: this.get<string>('ARBITRUM_ALCHEMY_API_KEY'),
        polygonAlchemyApiKey: this.get<string>('POLYGON_ALCHEMY_API_KEY'),
        ethAlchemyApiKey: this.get<string>('ETH_ALCHEMY_API_KEY'),
      },
      contracts: {
        ethereum: this.get<string>('ETHEREUM_NFT_CONTRACT_ADDR'),
        arbitrum: this.get<string>('ARBITRUM_NFT_CONTRACT_ADDR'),
        polygon: this.get<string>('POLYGON_NFT_CONTRACT_ADDR'),
      },
      providers: {
        etherscan: this.get<string>('ETHERSCAN_KEY'),
        infura: this.get<string>('INFURA_KEY'),
        alchemy: this.get<string>('ALCHEMY_KEY'),
        pocket: this.get<string>('POCKET_KEY'),
        ankr: this.get<string>('ANKR_KEY'),
      },
    };
  }

  get ipfs() {
    return {
      start: boolean(this.get<string>('IPFS_START', 'true')),
    };
  }

  get path() {
    return {
      packages: this.get<string>('PACKAGES_PATH', 'storage/packages'),
      chains: this.get<string>('CHAINS_PATH', 'storage/chains'),
    };
  }

  get verify() {
    return {
      integrity: boolean(this.get<string>('VERIFY_INTEGRITY', 'true')),
      signer: boolean(this.get<string>('VERIFY_SIGNER', 'true')),
      chainId: boolean(this.get<string>('VERIFY_CHAIN_ID', 'true')),
    };
  }
}
