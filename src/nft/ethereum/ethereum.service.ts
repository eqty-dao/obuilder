import { Injectable } from '@nestjs/common';
import { EthersService } from '../../common/ethers/ethers.service';
//import { NftInfo } from '../../interfaces/OwnableInfo';

@Injectable()
export class EthereumService {
  constructor(private ethers: EthersService) {}

  // public async getUnlockProof(nft: NftInfo): Promise<string> {
  //   const nftContract = this.ethers.getContract('LockableNFT', nft.network, nft.contractAddress);
  //   const challenge = await nftContract.unlockChallenge(nft.id);

  //   return await this.ethers.signMessage(challenge);
  // }

  // public async getIssuer(nft: NftInfo): Promise<string> {
  //   const nftContract = this.ethers.getContract('LockableNFT', nft.network, nft.contractAddress);
  //   return await nftContract.owner();
  // }
  public async GetServerETHBalance(): Promise<string> {
    return await this.ethers.GetServerETHBalance();
  }
  public async mintNFT(nftContractAddress: string, nftOwner: string, nftTokenURI:string): Promise<number> {
    return this.ethers.mintNFT('LockableNFT', nftContractAddress, nftOwner, nftTokenURI);    
  }
}
