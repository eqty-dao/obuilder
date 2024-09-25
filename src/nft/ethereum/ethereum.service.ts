import { Injectable } from '@nestjs/common';
import { EthersService } from '../../common/ethers/ethers.service';
import { NftInfo } from '../../interfaces/OwnableInfo';

@Injectable()
export class EthereumService {
  constructor(private ethers: EthersService) {}

  public async getNFTcount(nft: NftInfo): Promise<string> {
    return await this.ethers.getNFTcount(nft);
  }
  public async getOwnerOfNFT(nft: NftInfo): Promise<string> {
    return await this.ethers.getOwnerOfNFT(nft);
  }
  
  public isEVMAddress(_address: string): boolean {
    return this.ethers.isEVMAddress(_address);    
  }
  public async isBridge(bridgeAddress: string, nftInfo: NftInfo): Promise<boolean> {
    return await this.ethers.isBridge(bridgeAddress,nftInfo);
  }
  public async getBridgeBaseURI(bridgeAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethers.getBridgeBaseURI(bridgeAddress,nftInfo);
  }
  public async getServerETHBalance(): Promise<[string,string]> {
    return await this.ethers.getServerETHBalance();
  }
  
  public getEvmWalletAddress(): string {   
    return this.ethers.getEvmWalletAddress();

  }

  public async getTokenURI(nftInfo: NftInfo): Promise<string> {
    return await this.ethers.getTokenURI(nftInfo);
  }
  public async mintNFT(nftReceiverAddress: string, nftTokenURI: string, nftInfo: NftInfo): Promise<number> {
    return this.ethers.mintNFT(nftReceiverAddress, nftTokenURI, nftInfo);    
  }
  public async getBridgeCount(nftInfo: NftInfo): Promise<number> {
    return await this.ethers.getBridgeCount(nftInfo);    
  }
  public async getBridges(nftInfo: NftInfo): Promise<[string[], string[]]> {    
    return await this.ethers.getBridges(nftInfo);    
  }
  public async getListOfNftIdsPerAddress(network: string, walletAddress: string): Promise<number[]> {    
    return await this.ethers.getListOfNftIdsPerAddress(network, walletAddress);
  }
  public async transferNFT(nftReceiverAddress: string, nftInfo: NftInfo): Promise<string> {
    return await this.ethers.transferNFT(nftReceiverAddress, nftInfo);    
  }
}