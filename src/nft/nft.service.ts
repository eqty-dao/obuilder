import { Injectable } from '@nestjs/common';
import { EthersService } from '../ethers/ethers.service';
import { NftInfo } from '../interfaces/OwnableInfo';

@Injectable()
export class NFTService {
  constructor(private ethers: EthersService) { }


  public getEvmWalletAddresses(networkName: string): [string, string] {
    return this.ethers.getEvmWalletAddresses(networkName);
  }
  public isEVMAddress(_address: string): boolean {
    return this.ethers.isEVMAddress(_address);
  }
  
  public async getNFTcount(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<string> {
    return await this.ethers.getNFTcount(ltoNetworkId, nft);
  }
  public async getOwnerOfNFT(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<string> {
    return await this.ethers.getOwnerOfNFT(ltoNetworkId, nftInfo);
  }
  public async isBridge(ltoNetworkId: 'L' | 'T', bridgeAddress: string, nftInfo: NftInfo): Promise<boolean> {
    return await this.ethers.isBridge(ltoNetworkId, bridgeAddress, nftInfo);
  }
  public async getBridgeBaseURI(ltoNetworkId: 'L' | 'T', bridgeAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethers.getBridgeBaseURI(ltoNetworkId, bridgeAddress, nftInfo);
  }
  public async getServerETHBalance(ltoNetworkId: 'L' | 'T', networkName: string): Promise<string> {
    return await this.ethers.getServerETHBalance(ltoNetworkId, networkName);
  }
  public async getTokenURI(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<string> {
    return await this.ethers.getTokenURI(ltoNetworkId, nftInfo);
  }
  public async mintNFT(ltoNetworkId: 'L' | 'T', nftReceiverAddress: string, nftTokenURI: string, nftInfo: NftInfo): Promise<number> {
    return await this.ethers.mintNFT(ltoNetworkId, nftReceiverAddress, nftTokenURI, nftInfo);
  }
  public async getBridgeCount(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<number> {
    return await this.ethers.getBridgeCount(ltoNetworkId, nftInfo);
  }
  public async getBridges(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<[string[], string[]]> {
    return await this.ethers.getBridges(ltoNetworkId, nftInfo);
  }
  public async getListOfNftIdsPerAddress(ltoNetworkId: 'L' | 'T', network: string, walletAddress: string): Promise<number[]> {
    return await this.ethers.getListOfNftIdsPerAddress(ltoNetworkId, network, walletAddress);
  }
  public async transferNFT(ltoNetworkId: 'L' | 'T', nftReceiverAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethers.transferNFT(ltoNetworkId, nftReceiverAddress, nftInfo);
  }
}
