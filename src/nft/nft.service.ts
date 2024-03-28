import { Injectable } from '@nestjs/common';
import { EthereumService } from './ethereum/ethereum.service';
import { NftInfo } from '../interfaces/OwnableInfo';

@Injectable()
export class NFTService {
  constructor(private ethereum: EthereumService) {}

  // async getUnlockProof(nft: NFTInfo): Promise<string> {
  //   if (nft.network.startsWith('eip155:')) {
  //     return await this.ethereum.getUnlockProof(nft);
  //   }

  //   throw new Error(`Unknown network ${nft.network}`);
  // }

  // async getIssuer(nft: NFTInfo): Promise<string> {
  //   if (nft.network.startsWith('eip155:')) {
  //     return await this.ethereum.getIssuer(nft);
  //   }

  //   throw new Error(`Unknown network ${nft.network}`);
  // }
  public async GetServerETHBalance(): Promise<string> {
    console.log("ethereum");
    return await this.ethereum.GetServerETHBalance();
  }
  async mintNFT(nftContractAddress: string, nftOwner: string, nftTokenURI:string): Promise<number> {        
    return await this.ethereum.mintNFT(nftContractAddress, nftOwner, nftTokenURI);    
  }
}
