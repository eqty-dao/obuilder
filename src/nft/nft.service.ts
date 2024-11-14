import { Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum/ethereum.service';
import { NftInfo } from '../interfaces/OwnableInfo';

@Injectable()
export class NFTService {
  constructor(private ethereum: EthereumService) { }


  public getEvmWalletAddresses(): [string, string] {
    return this.ethereum.getEvmWalletAddresses();
  }
  public isEVMAddress(_address: string): boolean {
    return this.ethereum.isEVMAddress(_address);
  }
  
  public async getNFTcount(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<string> {
    return await this.ethereum.getNFTcount(ltoNetworkId, nft);
  }
  public async getOwnerOfNFT(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.getOwnerOfNFT(ltoNetworkId, nftInfo);
  }
  public async isBridge(ltoNetworkId: 'L' | 'T', bridgeAddress: string, nftInfo: NftInfo): Promise<boolean> {
    return await this.ethereum.isBridge(ltoNetworkId, bridgeAddress, nftInfo);
  }
  public async getBridgeBaseURI(ltoNetworkId: 'L' | 'T', bridgeAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.getBridgeBaseURI(ltoNetworkId, bridgeAddress, nftInfo);
  }
  public async getServerETHBalance(ltoNetworkId: 'L' | 'T'): Promise<[string, string]> {
    return await this.ethereum.getServerETHBalance(ltoNetworkId);
  }
  public async getTokenURI(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.getTokenURI(ltoNetworkId, nftInfo);
  }
  public async mintNFT(ltoNetworkId: 'L' | 'T', nftReceiverAddress: string, nftTokenURI: string, nftInfo: NftInfo): Promise<number> {
    return await this.ethereum.mintNFT(ltoNetworkId, nftReceiverAddress, nftTokenURI, nftInfo);
  }
  public async getBridgeCount(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<number> {
    return await this.ethereum.getBridgeCount(ltoNetworkId, nftInfo);
  }
  public async getBridges(ltoNetworkId: 'L' | 'T', nftInfo: NftInfo): Promise<[string[], string[]]> {
    return await this.ethereum.getBridges(ltoNetworkId, nftInfo);
  }
  public async getListOfNftIdsPerAddress(ltoNetworkId: 'L' | 'T', network: string, walletAddress: string): Promise<number[]> {
    return await this.ethereum.getListOfNftIdsPerAddress(ltoNetworkId, network, walletAddress);
  }
  public async transferNFT(ltoNetworkId: 'L' | 'T', nftReceiverAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.transferNFT(ltoNetworkId, nftReceiverAddress, nftInfo);
  }
}
