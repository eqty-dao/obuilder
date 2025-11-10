export default {
  env: {
    format: ['production', 'staging', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  coinmarketcap: {
    default: '',
    env: 'COINMARKETCAP_API_KEY',
  },
  pinata: {
    jwt: {
      default: '',
      env: 'PINATA_JWT',
    },
    gateway: {
      default: '',
      env: 'PINATA_GATEWAY_URL',
    },
  },
  telegramBot: {
    token: {
      default: '',
      env: 'TELEGRAM_BOT_TOKEN',
    },
    channelId: {
      mainnet: {
        default: '',
        env: 'TELEGRAM_CHANNEL_ID_MAINNET',
      },
      testnet: {
        default: '',
        env: 'TELEGRAM_CHANNEL_ID_TESTNET',
      },
    },
  },
  redis: {
    host: {
      default: 'localhost',
      env: 'REDIS_HOST',
    },
    port: {
      default: 6379,
      env: 'REDIS_PORT',
    },
  },
  bucket: {
    obuilder: {
      logs: {
        default: 'obuilder-logs',
        env: 'OBUILDER_BUCKET_LOGS',
      },
      queue: {
        mainnet: {
          default: 'obuilder-production',
          env: 'OWNABLE_BUCKET_QUEUE_MAINNET',
        },
        testnet: {
          default: 'obuilder-staging',
          env: 'OWNABLE_BUCKET_QUEUE_TESTNET',
        },
      },
      pinata: {
        mainnet: {
          default: 'obuilder-pinata-mainnet',
          env: 'PINATA_BUCKET_MAINNET',
        },
        testnet: {
          default: 'obuilder-pinata-testnet',
          env: 'PINATA_BUCKET_TESTNET',
        },
      },
      ownables: {
        mainnet: {
          default: 'obuilder-ownables-mainnet',
          env: 'OWNABLES_BUCKET_MAINNET',
        },
        testnet: {
          default: 'obuilder-ownables-testnet',
          env: 'OWNABLES_BUCKET_TESTNET',
        },
      },
    },
    localTesting: {
      default: false,
      env: 'LOCAL_TESTING',
    },
  },
  eqty: {
    templateCostsUSD: {
      mainnet: {
        default: '',
        env: 'EQTY_TEMPLATE_COSTSUSD_MAINNET',
      },
      testnet: {
        default: '',
        env: 'EQTY_TEMPLATE_COSTSUSD_TESTNET',
      },
    },
    networkId: {
      default: 'mainnet',
      env: 'EQTY_NETWORK_ID',
    },
    relay: {
      default: 'https://relay-dev.lto.network',
      env: 'RELAY_SERVER',
    },
    local_relay: {
      default: '',
      env: 'LOCAL_RELAY_SERVER',
    },
    queue: {
      mainnet: {
        default: true,
        env: 'QUEUEING_ALLOWED_MAINNET',
      },
      testnet: {
        default: true,
        env: 'QUEUEING_ALLOWED_TESTNET',
      },
    },
    requirePayment: {
      testnet: {
        default: true,
        env: 'REQUIRE_PAYMENT_TESTNET',
      },
    },
  },
  eth: {
    account: {
      obridge_wallet_address: {
        mainnet: {
          default: '',
          env: 'OBRIDGE_WALLET_ADDR_MAINNET',
        },
        testnet: {
          default: '',
          env: 'OBRIDGE_WALLET_ADDR_TESTNET',
        },
      },
      mnemonic: {
        mainnet: {
          default: '',
          env: 'ACCOUNT_MNEMONIC_MAINNET',
        },
        testnet: {
          default: '',
          env: 'ACCOUNT_MNEMONIC_TESTNET',
        },
      },
      arbitrum_alchemy_api_key: {
        default: '',
        env: 'ARBITRUM_ALCHEMY_API_KEY',
      },
      polygon_alchemy_api_key: {
        default: '',
        env: 'POLYGON_ALCHEMY_API_KEY',
      },
      eth_alchemy_api_key: {
        default: '',
        env: 'ETH_ALCHEMY_API_KEY',
      },
      base_alchemy_api_key: {
        default: '',
        env: 'BASE_ALCHEMY_API_KEY',
      },
    },
    contracts: {
      ethereum: {
        mainnet: {
          default: '',
          env: 'ETHEREUM_NFT_CONTRACT_ADDR_MAINNET',
        },
        testnet: {
          default: '',
          env: 'ETHEREUM_NFT_CONTRACT_ADDR_TESTNET',
        },
      },
      arbitrum: {
        mainnet: {
          default: '',
          env: 'ARBITRUM_NFT_CONTRACT_ADDR_MAINNET',
        },
        testnet: {
          default: '',
          env: 'ARBITRUM_NFT_CONTRACT_ADDR_TESTNET',
        },
      },
      polygon: {
        mainnet: {
          default: '',
          env: 'POLYGON_NFT_CONTRACT_ADDR_MAINNET',
        },
        testnet: {
          default: '',
          env: 'POLYGON_NFT_CONTRACT_ADDR_TESTNET',
        },
      },
      base: {
        mainnet: {
          default: '',
          env: 'BASE_NFT_CONTRACT_ADDR_MAINNET',
        },
        testnet: {
          default: '',
          env: 'BASE_NFT_CONTRACT_ADDR_TESTNET',
        },
      },
    },
  },
  path: {
    packages: {
      default: 'storage/packages',
      env: 'PACKAGES_PATH',
    },
    chains: {
      default: 'storage/chains',
      env: 'CHAINS_PATH',
    },
  },
  api: {
    secretKey: {
      default: '',
      env: 'API_SECRET_KEY',
    },
  },
};
