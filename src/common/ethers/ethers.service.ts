import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers, HDNodeWallet } from 'ethers';
import { ConfigService } from '../config/config.service';
import * as abis from './abi';
// import { Networkish, getNetwork, JsonRpcProvider, AlchemyProvider, Provider } from '@ethersproject/providers';

// type NetworkSettings = {
//   id: number;
//   name: string;
//   provider: 'jsonrpc' | 'etherscan' | 'infura' | 'alchemy' | 'cloudflare' | 'pocket' | 'ankr';
//   url?: string;
// };

@Injectable()
export class EthersService implements OnModuleInit {
  private wallet: ethers.Wallet;
  private signer: HDNodeWallet;
  private readonly providers: Map<string | number, ethers.Provider> = new Map();

  constructor(private config: ConfigService) { }

  onModuleInit(): void {
    
    // const alchemyProvider = ethers.getDefaultProvider('https://arb-sepolia.g.alchemy.com/v2/dN8Sr0rKWmfbfV2GsKpFbl98_QkeiR6j');
    
    const network:ethers.Networkish = { name: 'arbitrum-sepolia', chainId: 421614}; // new Network('arbitrum-sepolia', 421614)
    const alchemyProvider = new ethers.AlchemyProvider(network, this.config.get('eth.account.arbitrum_alchemy_api_key'));
    console.log("Mnemonic:", this.config.get('eth.account.mnemonic'));
    console.log("alchemyProvider", alchemyProvider);    
    this.signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic'), alchemyProvider);
    console.log("signer",this.signer)


    // this.initProviders();
  }
  public signMessage(message: string | Uint8Array): Promise<string> {
    return this.wallet.signMessage(message);
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
  
  // private initProviders() {
  //   const networks = this.config.get('eth.networks');
  //   const providerKeys = this.config.get('eth.providers');

  //   for (const network of networks) {
  //     const provider = this.createProvider(network, providerKeys);
  //     this.providers.set(network.id, provider);
  //     this.providers.set(network.name, provider);
  //   }
  // }

  // private createProvider(network: NetworkSettings, providerKeys: { [_: string]: string }): ethers.Provider {
  //   switch (network.provider) {
  //     case 'jsonrpc':
  //       return new ethers.JsonRpcProvider(network.url, {
  //         name: network.name,
  //         chainId: network.id,
  //       });
  //     case 'etherscan':
  //       return new ethers.EtherscanProvider(network.id, providerKeys.etherscan);
  //     case 'infura':
  //       return new ethers.InfuraProvider(network.id, providerKeys.infura);
  //     case 'alchemy':
  //       return new ethers.AlchemyProvider(network.id, providerKeys.alchemy);      
  //     case 'pocket':
  //       return new ethers.PocketProvider(network.id, providerKeys.pocket);
  //     case 'ankr':
  //       return new ethers.AnkrProvider(network.id, providerKeys.ankr);
  //   }
  // }

  // public getContract(type: keyof typeof abis, network: Networkish, address: string): ethers.Contract {
  //   if (!(type in abis)) throw new Error(`No ABI for ${type}`);

  //   const networkId = typeof network === 'object' ? network.chainId : network;
  //   const provider = this.providers.get(networkId);
  //   if (!provider) throw new Error(`No provider for network ${networkId}`);

  //   return new ethers.Contract(address, abis[type], provider);
  // }

  
}
