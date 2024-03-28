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
      matic_alchemy_api_key: 'lwjpXnB8A3LB1Hl9DoOHfuj5Onq70U-v',
      eth_alchemy_api_key: '',
    },
    contracts: {
      ethereum: '',  // Ethereum sepolia
      arbitrum: '0x6D38F446d03Fed2dc82a862A8cc28CFe3F57ad4f', // Arbitrum sepolia
      matic: '0x6bFb332D5296f535e1f98318fd7778e1D6252AA4', // Matic Mumbai (Polygon Mumbai)
    },
  },
  ipfs: {
    start: false,
  },
};
