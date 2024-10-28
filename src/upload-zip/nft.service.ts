import { Injectable, OnModuleInit } from '@nestjs/common';
import { PinataSDK } from 'pinata';
import { ConfigService } from 'src/common/config/config.service';

@Injectable()
export class NftService implements OnModuleInit {
  private pinata;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const pinataJwt = this.config.pinata.jwt;
    const pinataGateway = this.config.pinata.gateway;

    if (!pinataJwt || !pinataGateway) {
      throw new Error('Pinata configuration is missing');
    }

    this.pinata = new PinataSDK({
      pinataJwt,
      pinataGateway,
    });
  }

  async handleNftCreation(metadata: any) {
    if (metadata.CREATE_NFT !== 'true') {
      return { network: '', address: '', id: 0 };
    }

    const imageUrl = await this.pinImageToPinata(metadata.PLACEHOLDER2_IMG);
    return await this.mintNft(metadata.NFT_BLOCKCHAIN, imageUrl);
  }

  private async pinImageToPinata(imagePath: string): Promise<string> {
    try {
      const readableStreamForFile = require('fs').createReadStream(imagePath);
      const result = await this.pinata.pinFileToIPFS(readableStreamForFile);
      return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
    } catch (error) {
      throw new Error(`Failed to pin image to Pinata: ${error.message}`);
    }
  }

  private async mintNft(network: string, tokenUri: string) {
    // Placeholder for minting NFT based on the specified network
    return {
      network,
      address: 'mock_address',
      id: Math.floor(Math.random() * 1000),
    };
  }
}
