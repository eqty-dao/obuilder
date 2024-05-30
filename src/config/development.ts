export default {
  lto: {
    node: 'https://testnet.lto.network',
    networkId: 'T',
    account: {
      seed: 'test1 test2 test3 test4 test5 test6 test7 test8 test9 test10 test11 test12',
    },
  },
  eth: {
    account: {
      mnemonic: 'sell globe farm embody menu tennis cruise hero crawl universe stock enrich',
      arbitrum_alchemy_api_key: 'dN8Sr0rKWmfbfV2GsKpFbl98_QkeiR6j',
      polygon_alchemy_api_key: '7BXCsiKVO6RNJ7cPllx17hQHTa-nEx_I',
      eth_alchemy_api_key: 'oI9B3F4SsW2kFEuEKwfIgn_Wxz5NoEz9',
    },
    contracts: {
      ethereum: '0x56213ECA28860d8fb5DAF6A8dCdA7bB28d7c360F',  // Ethereum sepolia
      arbitrum: '0x1527f2f8Cd41b000e1E8F70906012bEFab993AD9', // Arbitrum sepolia
      polygon: '', // Polygon Amoy
    },
  },
  ipfs: {
    start: false,
  },
};
