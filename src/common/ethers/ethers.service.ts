import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { ConfigService } from '../config/config.service';
import { NftInfo } from '../../interfaces/OwnableInfo';
import { DataError } from '../../interfaces/error';
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
  private alchemyProviderETH: ethers.AlchemyProvider;
  private alchemyProviderARB: ethers.AlchemyProvider;
  private networkETH: ethers.Networkish;
  private networkARB: ethers.Networkish;
  private readonly providers: Map<string | number, ethers.Provider> = new Map();

  constructor(private config: ConfigService) {}

  onModuleInit(): void {

    this.alchemyProviderARB = new ethers.AlchemyProvider(...this.getNetwork('arbitrum'));
    this.alchemyProviderETH = new ethers.AlchemyProvider(...this.getNetwork('ethereum'));
    // const mnemonic = this.config.get('eth.account.mnemonic');    
    // this.signer = ethers.Wallet.fromPhrase(mnemonic, this.alchemyProviderARB);

  }
  public async getNFTcount(nft: NftInfo): Promise<string> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return (await nftContract.getNftCount()).toString();
  }
  public async getOwnerOfNFT(nft: NftInfo): Promise<string> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return (await nftContract.ownerOf(nft.id.toString())).toString();
  }
  public isEVMAddress(_address: string): boolean {
    return ethers.isAddress(_address);
  }

  // public signMessage(message: string | Uint8Array): Promise<string> {
  //   return this.signer.signMessage(message);
  // }

  public async getServerETHBalance(): Promise<[string, string]> {
    const alchemyProvider = new ethers.AlchemyProvider(...this.getNetwork('ethereum'));
    this.signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic'), alchemyProvider);
    const balanceETH: string = ethers.formatUnits(await this.alchemyProviderETH.getBalance(this.signer.address), 'ether').toString();
    const balanceARB: string = ethers.formatUnits(await this.alchemyProviderARB.getBalance(this.signer.address), 'ether').toString();
    return [balanceETH, balanceARB];
  }

  private getNetwork(networkName: string): [ethers.Networkish, string] {
    // https://docs.ethers.org/v6/api/providers/thirdparty/#AlchemyProvider

    const networkId = this.config.get('lto.networkId');
    switch (networkName) {
      case 'ethereum':
        if (networkId === 'T')
          return [{ name: 'sepolia', chainId: 11155111 }, this.config.get('eth.account.eth_alchemy_api_key')]; // Sepolia Testnet
        else return [{ name: 'mainnet', chainId: 1 }, this.config.get('eth.account.eth_alchemy_api_key')]; // Ethereum Mainnet
      case 'arbitrum':
        if (networkId === 'T')
          // Arbitrum Sepolia Testnet
          return [{ name: 'arbitrum-sepolia', chainId: 421614 }, this.config.get('eth.account.arbitrum_alchemy_api_key')];
        else return [{ name: 'arbitrum', chainId: 42161 }, this.config.get('eth.account.arbitrum_alchemy_api_key')]; // Arbitrum Mainnet
      case 'polygon':
        if (networkId === 'T')
          return [{ name: 'matic-amoy', chainId: 80002 }, this.config.get('eth.account.polygon_alchemy_api_key')]; // Polygon Amoy Testnet
        else return [{ name: 'matic', chainId: 137 }, this.config.get('eth.account.polygon_alchemy_api_key')]; // Polygon mainnet
      // case 'base':
      //   if (networkId === 'T') return ['base-sepolia', 84532,this.config.get('eth.account.base_alchemy_api_key')]; // Base Sepolia Testnet
      //   else return ['base', 8453,this.config.get('eth.account.base_alchemy_api_key')]; // Base mainnet
    }
  }
  public getEvmWalletAddress(): string {    
    this.signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic'), this.alchemyProviderETH);
    return this.signer.address.toString();

  }
  private getContract(type: keyof typeof abis, networkName: string, address: string): ethers.Contract {
    if (!(type in abis)) throw new Error(`No ABI for ${type}`);

    const alchemyProvider = new ethers.AlchemyProvider(...this.getNetwork(networkName));

    this.signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic'), alchemyProvider);

    const nftContract: ethers.Contract = new ethers.Contract(address, abis[type], this.signer);
    return nftContract;
  }

  public async mintNFT(nftReceiverAddress: string, nftTokenURI: string, nft: NftInfo): Promise<number> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    try {
      const response = await nftContract.mint(nftReceiverAddress, nftTokenURI);
      await response.wait();
      const nftcount = await nftContract.getNftCount();
      return Number(nftcount.toString());
    } catch (err) {
      throw new DataError(err);
    }
  }
  public async getTokenURI(nft: NftInfo): Promise<string> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return await nftContract.getTokenURI(nft.id);
  }
  public async isBridge(bridgeAddress: string, nft: NftInfo): Promise<boolean> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return await nftContract.isBridge(bridgeAddress);
  }
  public async getBridgeBaseURI(bridgeAddress: string, nft: NftInfo): Promise<string> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return await nftContract.getBridgeBaseURI(bridgeAddress);
  }
  public async getBridgeCount(nft: NftInfo): Promise<number> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return await nftContract.getBridgeCount();    
  }
  public async getBridges(nft: NftInfo): Promise<[string[], string[]]> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    return await nftContract.getBridges();    
  }
  public async getListOfNftIdsPerAddress(network: string, walletAddress: string): Promise<number[]> {
    
    let smartContractAddress: string;
    if(network === 'ethereum') {
      smartContractAddress = this.config.get('eth.contracts.ethereum');
    }else if(network === 'arbitrum') {
      smartContractAddress = this.config.get('eth.contracts.arbitrum');
    } else {
      throw new DataError(`Unknown EVM Network ${network}. Possible options: ethereum or arbitrum`);
    }    
    const nftContract = this.getContract('OBridgeNFT', network, smartContractAddress);
    return await nftContract.getListOfNftIdsPerAddress(walletAddress);
  }

  public async transferNFT(nftReceiverAddress: string, nft: NftInfo): Promise<string> {
    const nftContract = this.getContract('OBridgeNFT', nft.network, nft.address);
    try {
      const response = await nftContract.transferFrom(this.signer.address, nftReceiverAddress, nft.id);
      await response.wait();
      return (await nftContract.ownerOf(nft.id.toString())).toString();
    } catch (err) {
      throw new DataError(err);
    }
  }
}
