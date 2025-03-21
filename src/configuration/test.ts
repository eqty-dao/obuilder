export default {
	env: 'test',
	
	// Test API keys (use dummy values)
	coinmarketcap: 'test-api-key',
	
	pinata: {
	  jwt: 'test-jwt-token',
	  gateway: 'https://test-gateway.pinata.cloud'
	},
	
	telegramBot: {
	  token: 'test-telegram-token',
	  channelId: {
		mainnet: 'test-channel-l',
		testnet: 'test-channel-t'
	  }
	},
	
	bucket: {
	  localTesting: true,
	  obuilder: {
		logs: 'test-logs-bucket',
		queue: {
		  mainnet: 'test-queue-mainnet',
		  testnet: 'test-queue-testnet'
		},
		pinata: {
		  mainnet: 'test-pinata-mainnet',
		  testnet: 'test-pinata-testnet'
		},
		ownables: {
		  mainnet: 'test-ownables-mainnet',
		  testnet: 'test-ownables-testnet'
		}
	  }
	},
	
	lto: {
	  templateCostsUSD: {
		mainnet: '10',
		testnet: '1'
	  },
	  networkId: 'T',
	  node: {
		mainnet: 'https://test-mainnet.lto.network',
		testnet: 'https://test-testnet.lto.network'
	  },
	  account: {
		seed: {
		  mainnet: 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat',
		  testnet: 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'
		}
	  },
	  relay: 'https://test-relay.lto.network',
	  local_relay: 'http://localhost:8080',
	  queue: {
		mainnet: true,
		testnet: true
	  }
	},
	
	eth: {
	  account: {
		obridge_wallet_address: {
		  mainnet: '0xTestMainnetAddress',
		  testnet: '0xTestTestnetAddress'
		},
		mnemonic: {
		  mainnet: 'test test test test test test test test test test test test',
		  testnet: 'test test test test test test test test test test test test'
		},
		arbitrum_alchemy_api_key: 'test-arbitrum-key',
		polygon_alchemy_api_key: 'test-polygon-key',
		eth_alchemy_api_key: 'test-eth-key'
	  },
	  contracts: {
		ethereum: {
		  mainnet: '0xTestEthereumMainnet',
		  testnet: '0xTestEthereumTestnet'
		},
		arbitrum: {
		  mainnet: '0xTestArbitrumMainnet',
		  testnet: '0xTestArbitrumTestnet'
		},
		polygon: {
		  mainnet: '0xTestPolygonMainnet',
		  testnet: '0xTestPolygonTestnet'
		}
	  }
	},
	
	ipfs: {
	  start: false
	},
	
	path: {
	  packages: 'test/packages',
	  chains: 'test/chains'
	}
  };
