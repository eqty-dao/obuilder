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
      ethereum: '0xaCAD060e94E34AA6026E531fddd7f3F2B854a7AC',  // Ethereum sepolia
      arbitrum: '0x50581c978933af5798f5dbE7FDb0f1bdBa10A171', // Arbitrum sepolia
      polygon: '', // Polygon Amoy
    },
  },
  ipfs: {
    start: false,
  },
};
