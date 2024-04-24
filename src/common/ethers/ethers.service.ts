import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { ConfigService } from '../config/config.service';
import * as abis from './abi';
// import { Networkish } from '@ethersproject/networks';

// type NetworkSettings = {
//   id: number;
//   name: string;
//   provider: 'jsonrpc' | 'etherscan' | 'infura' | 'alchemy' | 'cloudflare' | 'pocket' | 'ankr';
//   url?: string;
// };

@Injectable()
export class EthersService implements OnModuleInit {
  // private wallet: ethers.Wallet;
  private signer: ethers.HDNodeWallet;
  private alchemyProvider: ethers.AlchemyProvider;
  private network: ethers.Networkish;
  private readonly providers: Map<string | number, ethers.Provider> = new Map();

  constructor(private config: ConfigService) { }

  onModuleInit(): void {
    this.network = { name: 'arbitrum-sepolia', chainId: 421614 };
    this.alchemyProvider = new ethers.AlchemyProvider(
      this.network,
      this.config.get('eth.account.arbitrum_alchemy_api_key'),
    );
    this.signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic'), this.alchemyProvider);
  }

  public signMessage(message: string | Uint8Array): Promise<string> {
    return this.signer.signMessage(message);
  }

  public async GetServerETHBalance(): Promise<string> {
    // console.log("Blocknumber:", await this.alchemyProvider.getBlockNumber());
    return ethers.formatUnits(await this.alchemyProvider.getBalance(this.signer.address), 'ether').toString();
  }

  private getNetwork(networkName: string): [string, number, string] {
    // https://docs.ethers.org/v6/api/providers/thirdparty/#AlchemyProvider
    const networkId = this.config.get('lto.networkId');
    switch (networkName) {
      case 'eip155:ethereum':
        if (networkId === 'T')
          return ['sepolia', 11155111, this.config.get('eth.account.eth_alchemy_api_key')]; // Sepolia Testnet
        else return ['mainnet', 1, this.config.get('eth.account.eth_alchemy_api_key')]; // Ethereum Mainnet
      case 'eip155:arbitrum':
        if (networkId === 'T')
          // Arbitrum Sepolia Testnet
          return ['arbitrum-sepolia', 421614, this.config.get('eth.account.arbitrum_alchemy_api_key')];
        else return ['arbitrum', 42161, this.config.get('eth.account.arbitrum_alchemy_api_key')]; // Arbitrum Mainnet
      case 'eip155:polygon':
        if (networkId === 'T')
          return ['matic-amoy', 80002, this.config.get('eth.account.polygon_alchemy_api_key')]; // Polygon Amoy Testnet
        else return ['matic', 137, this.config.get('eth.account.polygon_alchemy_api_key')]; // Polygon mainnet
      // case 'base':
      //   if (networkId === 'T') return ['base-sepolia', 84532,this.config.get('eth.account.base_alchemy_api_key')]; // Base Sepolia Testnet
      //   else return ['base', 8453,this.config.get('eth.account.base_alchemy_api_key')]; // Base mainnet
    }
  }

  public getContract(type: keyof typeof abis, networkName: string, address: string): ethers.Contract {
    if (!(type in abis)) throw new Error(`No ABI for ${type}`);
    const [alchemyNetworkNameMapped, chainId, providerApiKey] = this.getNetwork(networkName);
    this.network = { name: alchemyNetworkNameMapped, chainId: chainId };

    this.alchemyProvider = new ethers.AlchemyProvider(this.network, providerApiKey);

    this.signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic'), this.alchemyProvider);

    const nftContract: ethers.Contract = new ethers.Contract(address, abis[type], this.signer);
    return nftContract;
  }
  
  public async mintNFT(type: keyof typeof abis, contractAddress: string, nftOwner: string, nftTokenURI: string): Promise<number> {
    if (!(type in abis)) throw new Error(`No ABI for ${type}`);

    // contract instance
    const nftContract: ethers.Contract = new ethers.Contract(contractAddress, abis[type], this.signer);

    const response = await nftContract.mint(nftOwner, true, nftTokenURI);
    await response.wait();
    const nftcount = await nftContract.getNftCount();
    return nftcount;
  }
  
   
  
}
