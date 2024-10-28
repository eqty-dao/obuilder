export default {
  env: {
    format: ['production', 'staging', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
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
  lto: {
    node: {
      default: '',
      env: 'LTO_NODE',
    },
    networkId: {
      default: '',
      env: 'LTO_NETWORK_ID',
    },
    account: {
      seed: {
        default: '',
        env: 'LTO_ACCOUNT_SEED',
      },
    },
    relay: {
      default: '',
      env: 'RELAY_SERVER',
    },
    local_relay: {
      default: '',
      env: 'LOCAL_RELAY_SERVER',
    },
    queue: {
      default: true,
      env: 'QUEUEING_ALLOWED',
    },
  },
  eth: {
    account: {
      obridge_wallet_address: {
        default: '',
        env: 'OBRIDGE_WALLET_ADDR',
      },
      mnemonic: {
        default: '',
        env: 'ACCOUNT_MNEMONIC',
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
    },
    contracts: {
      ethereum: {
        default: '',
        env: 'ETHEREUM_NFT_CONTRACT_ADDR',
      },
      arbitrum: {
        default: '',
        env: 'ARBITRUM_NFT_CONTRACT_ADDR',
      },
      polygon: {
        default: '',
        env: 'POLYGON_NFT_CONTRACT_ADDR',
      },
    },
    providers: {
      etherscan: {
        default: '',
        env: 'ETHERSCAN_KEY',
      },
      infura: {
        default: '',
        env: 'INFURA_KEY',
      },
      alchemy: {
        default: '',
        env: 'ALCHEMY_KEY',
      },
      pocket: {
        default: '',
        env: 'POCKET_KEY',
      },
      ankr: {
        default: '',
        env: 'ANKR_KEY',
      },
    },
  },
  ipfs: {
    start: {
      default: true,
      env: 'IPFS_START',
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
  verify: {
    integrity: {
      default: true,
      env: 'VERIFY_INTEGRITY',
    },
    signer: {
      // Flag to verify signer information
      default: true,
      env: 'VERIFY_SIGNER',
    },
    chainId: {
      // Flag to verify the chain ID
      default: true,
      env: 'VERIFY_CHAIN_ID',
    },
  },
};
