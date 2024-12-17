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
		}
	},
	telegramBot: {
		token: {
			default: '',
			env: 'TELEGRAM_BOT_TOKEN',
		},
		channelId: {
			mainnet: {
				default: '',
				env: 'TELEGRAM_CHANNEL_ID_L',
			},
			testnet: {
				default: '',
				env: 'TELEGRAM_CHANNEL_ID_T',
			}
		}
	},
	bucket: {
		obuilder: {
			logs: {
				default: 'obuilder-logs',
				env: 'OBUILDER_BUCKET_LOGS'
			},
			queue: {
				mainnet: {
					default: 'obuilder-production',
					env: 'OWNABLE_BUCKET_QUEUE_L'
				},
				testnet: {
					default: 'obuilder-staging',
					env: 'OWNABLE_BUCKET_QUEUE_T'
				},
			},
			pinata: {
				mainnet: {
					default: 'obuilder-pinata-mainnet',
					env: 'PINATA_BUCKET_L'
				},
				testnet: {
					default: 'obuilder-pinata-testnet',
					env: 'PINATA_BUCKET_T'
				},
			},
			ownables: {
				mainnet: {
					default: 'obuilder-ownables-mainnet',
					env: 'OWNABLES_BUCKET_L'
				},
				testnet: {
					default: 'obuilder-ownables-testnet',
					env: 'OWNABLES_BUCKET_T'
				},
				
			}
		},
		localTesting: {
			default: false,
			env: 'LOCAL_TESTING',
		}
	},
	// port: {
	//   default: 80,
	//   env: 'PORT',
	// },  
	// accept: {
	//   unlockNFT: {
	//     default: true,
	//     env: 'UNLOCK_NFT',
	//   },
	//   webhook: {
	//     default: '',
	//     env: 'ACCEPT_WEBHOOK',
	//   },
	// },
	lto: {
		templateCostsUSD: {
			mainnet: {
				default: '',
				env: 'LTO_TEMPLATE_COSTSUSD_L'
			},
			testnet: {
				default: '',
				env: 'LTO_TEMPLATE_COSTSUSD_T'
			}
		},
		networkId: {
			default: 'L',
			env: 'LTO_NETWORK_ID'
		},
		node: {
			mainnet: {
				default: '',
				env: 'LTO_NODE_L'
			},
			testnet: {
				default: '',
				env: 'LTO_NODE_T'
			}
		},
		account: {
			seed: {
				mainnet: {
					default: '',
					env: 'LTO_ACCOUNT_SEED_L'
				},
				testnet: {
					default: '',
					env: 'LTO_ACCOUNT_SEED_T'
				},
			},
		},
		relay: {
			default: '',
			env: 'RELAY_SERVER',
		},
		local_relay: {
			default: '',
			env: 'RELAY_SERVER',
		},
		queue: {
			mainnet: {
				default: true,
				env: 'QUEUEING_ALLOWED_L',
			},
			testnet: {
				default: true,
				env: 'QUEUEING_ALLOWED_T',
			}
		}
	},
	eth: {
		account: {
			obridge_wallet_address: {
				mainnet: {
					default: '',
					env: 'OBRIDGE_WALLET_ADDR_L',
				}, testnet: {
					default: '',
					env: 'OBRIDGE_WALLET_ADDR_T',
				}
			},
			mnemonic: {
				mainnet: {
					default: '',
					env: 'ACCOUNT_MNEMONIC_L',
				}, testnet: {
					default: '',
					env: 'ACCOUNT_MNEMONIC_T',
				}
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
				mainnet: {
					default: '',
					env: 'ETHEREUM_NFT_CONTRACT_ADDR_L',
				}, testnet: {
					default: '',
					env: 'ETHEREUM_NFT_CONTRACT_ADDR_T',
				}
			},
			arbitrum: {
				mainnet: {
					default: '',
					env: 'ARBITRUM_NFT_CONTRACT_ADDR_L',
				}, testnet: {
					default: '',
					env: 'ARBITRUM_NFT_CONTRACT_ADDR_T',
				}
			},
			polygon: {
				mainnet: {
					default: '',
					env: 'POLYGON_NFT_CONTRACT_ADDR',
				}, testnet: {
					default: '',
					env: 'POLYGON_NFT_CONTRACT_ADDR_T',
				}
			},
		},
		// providers: {
		//   etherscan: {
		//     default: '',
		//     env: 'ETHERSCAN_KEY',
		//   },
		//   infura: {
		//     default: '',
		//     env: 'INFURA_KEY',
		//   },
		//   alchemy: {
		//     default: '',
		//     env: 'ALCHEMY_KEY',
		//   },
		//   pocket: {
		//     default: '',
		//     env: 'POCKET_KEY',
		//   },
		//   ankr: {
		//     default: '',
		//     env: 'ANKR_KEY',
		//   },
		// },
		// networks: {
		//   default: [
		//     {
		//       id: 421614,
		//       name: 'arbitrumSepolia',
		//       provider: 'jsonrpc' as 'jsonrpc' | 'etherscan' | 'infura' | 'alchemy' | 'cloudflare' | 'pocket' | 'ankr',
		//       url: '',
		//     },
		//   ],
		//   // default: [
		//   //   {
		//   //     id: 80001,
		//   //     name: 'PolygonMumbai',
		//   //     provider: 'alchemy' as 'jsonrpc' | 'etherscan' | 'infura' | 'alchemy' | 'cloudflare' | 'pocket' | 'ankr',
		//   //     url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_MUMBAI_ALCHEMY_API_KEY}`,
		//   //   },
		//   // ],
		//   format: 'typed-array',
		//   children: {
		//     id: {
		//       default: 0,
		//     },
		//     name: {
		//       default: '',
		//     },
		//     provider: {
		//       format: ['jsonrpc', 'etherscan', 'infura', 'alchemy', 'cloudflare', 'pocket', 'ankr'],
		//       default: 'jsonrpc',
		//     },
		//     url: {
		//       default: '',
		//     },
		//   },
		// },
	},
	// log: {
	//   level: {
	//     default: '',
	//     env: 'LOG_LEVEL',
	//   },
	// },
	// ssl: {
	//   enabled: {
	//     default: false,
	//     env: 'SSL_ENABLED',
	//   },
	// },
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
	// verify: {
	//   integrity: {
	//     default: true,
	//     env: 'VERIFY_INTEGRITY',
	//   },
	//   signer: {
	//     default: true,
	//     env: 'VERIFY_SIGNER',
	//   },
	//   chainId: {
	//     default: true,
	//     env: 'VERIFY_CHAIN_ID',
	//   },
	// },
};
