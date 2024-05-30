import { Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum/ethereum.service';
import { NftInfo } from '../interfaces/OwnableInfo';

@Injectable()
export class NFTService {
  constructor(private ethereum: EthereumService) {}

  
  public async getNFTcount(nft: NftInfo): Promise<string> {
    return await this.ethereum.getNFTcount(nft);
  }

  public async GetServerETHBalance(): Promise<string> {
    return await this.ethereum.GetServerETHBalance();
  }
  async mintNFT(nftContractAddress: string, nftOwner: string, nftTokenURI:string): Promise<number> {        
    return await this.ethereum.mintNFT(nftContractAddress, nftOwner, nftTokenURI);    
  }
}
