import { Injectable } from '@nestjs/common';
import { EthersService } from '../../common/ethers/ethers.service';
import { NftInfo } from '../../interfaces/OwnableInfo';

@Injectable()
export class EthereumService {
  constructor(private ethers: EthersService) {}

  public async getNFTcount(nft: NftInfo): Promise<string> {
    const nftContract = this.ethers.getContract('LockableNFT', nft.network, nft.address);
    return (await nftContract.getNftCount()).toString();
  }

  public async GetServerETHBalance(): Promise<string> {
    return await this.ethers.GetServerETHBalance();
  }
  public async mintNFT(nftContractAddress: string, nftOwner: string, nftTokenURI:string): Promise<number> {
    return this.ethers.mintNFT('LockableNFT', nftContractAddress, nftOwner, nftTokenURI);    
  }
}
