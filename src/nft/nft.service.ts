import { Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum/ethereum.service';
import { NftInfo } from '../interfaces/OwnableInfo';

@Injectable()
export class NFTService {
  constructor(private ethereum: EthereumService) {}

  
  public async getNFTcount(nft: NftInfo): Promise<string> {
    return await this.ethereum.getNFTcount(nft);
  }
  public async getOwnerOfNFT(nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.getOwnerOfNFT(nftInfo);
  }

  public isEVMAddress(_address: string): boolean {
    return this.ethereum.isEVMAddress(_address);    
  }
  public async isBridge(bridgeAddress: string, nftInfo: NftInfo): Promise<boolean> {
    return await this.ethereum.isBridge(bridgeAddress, nftInfo);
  }
  public async getBridgeBaseURI(bridgeAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.getBridgeBaseURI(bridgeAddress, nftInfo);
  }
  public async getServerETHBalance(): Promise<[string,string]> {
    return await this.ethereum.getServerETHBalance();
  }
  public getEvmWalletAddress(): string {   
    return this.ethereum.getEvmWalletAddress();

  }
  public async getTokenURI(nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.getTokenURI(nftInfo);
  }
  public async mintNFT(nftReceiverAddress: string, nftTokenURI: string, nftInfo: NftInfo): Promise<number> {
    return await this.ethereum.mintNFT(nftReceiverAddress, nftTokenURI, nftInfo);    
  }
  public async getBridgeCount(nftInfo: NftInfo): Promise<number> {
    return await this.ethereum.getBridgeCount(nftInfo);    
  }
  public async getBridges(nftInfo: NftInfo): Promise<[string[], string[]]> {    
    return await this.ethereum.getBridges(nftInfo);    
  }
  public async getListOfNftIdsPerAddress(network: string, walletAddress: string): Promise<number[]> {    
    return await this.ethereum.getListOfNftIdsPerAddress(network, walletAddress);
  }
  public async transferNFT(nftReceiverAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethereum.transferNFT(nftReceiverAddress, nftInfo);    
  }
}
