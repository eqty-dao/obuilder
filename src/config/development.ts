export default {
  lto: {
    //node: 'https://testnet.lto.network',
    node: '',
    networkId: 'T',
    account: {      
      seed: '',
    },
    // relay: 'https://relay.lto.network',
    relay: '',
    local_relay: 'http://localhost:3000',
  },
  eth: {
    account: {
      mnemonic: '',
      eth_alchemy_api_key: 'm7wpMjKVPvrU_NMGEwEntAzGtk6ygVDF',
      arbitrum_alchemy_api_key: 'udkYo9BHmW6DqIzQohVDeDDsHjf_97pg',
      // polygon_alchemy_api_key: '7BXCsiKVO6RNJ7cPllx17hQHTa-nEx_I',
    },
    contracts: {
      ethereum: '0x56213ECA28860d8fb5DAF6A8dCdA7bB28d7c360F',  // Ethereum sepolia
      arbitrum: '0x1527f2f8Cd41b000e1E8F70906012bEFab993AD9', // Arbitrum sepolia
      // polygon: '', // Polygon Amoy
    },
  },
  ipfs: {
    start: false,
  },
};
