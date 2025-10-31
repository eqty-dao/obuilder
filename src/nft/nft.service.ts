import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { EthersService } from '../ethers/ethers.service';
import { NftInfo } from '../interfaces/OwnableInfo';
import { ConfigService } from '../config/config.service';
import { LoggingService } from '../logging/redis-logging.service';
import { RedisQueueService } from '../queue/redis-queue.service';
import { CoinmarketcapService } from '../coinmarketcap/coinmarketcap.service';
@Injectable()
export class NFTService {
  constructor(
    private ethers: EthersService,
    private readonly config: ConfigService,
    private readonly loggingService: LoggingService,
    private readonly queueService: RedisQueueService,
    private readonly coinmarketcapService: CoinmarketcapService,
  ) {}

  public getEvmWalletAddresses(networkName: string): [string, string] {
    return this.ethers.getEvmWalletAddresses(networkName);
  }
  public isEVMAddress(_address: string): boolean {
    return this.ethers.isEVMAddress(_address);
  }

  public async getNFTcount(
    ltoNetworkId: 'L' | 'T',
    nft: NftInfo,
  ): Promise<string> {
    return await this.ethers.getNFTcount(ltoNetworkId, nft);
  }
  public async getOwnerOfNFT(
    ltoNetworkId: 'L' | 'T',
    nftInfo: NftInfo,
  ): Promise<string> {
    return await this.ethers.getOwnerOfNFT(ltoNetworkId, nftInfo);
  }
  public async isBridge(
    ltoNetworkId: 'L' | 'T',
    bridgeAddress: string,
    nftInfo: NftInfo,
  ): Promise<boolean> {
    return await this.ethers.isBridge(ltoNetworkId, bridgeAddress, nftInfo);
  }
  public async getBridgeBaseURI(
    ltoNetworkId: 'L' | 'T',
    bridgeAddress: string,
    nftInfo: NftInfo,
  ): Promise<string> {
    return await this.ethers.getBridgeBaseURI(
      ltoNetworkId,
      bridgeAddress,
      nftInfo,
    );
  }
  public async getServerETHBalance(
    ltoNetworkId: 'L' | 'T',
    networkName: string,
  ): Promise<string> {
    return await this.ethers.getServerETHBalance(ltoNetworkId, networkName);
  }
  public async getTokenURI(
    ltoNetworkId: 'L' | 'T',
    nftInfo: NftInfo,
  ): Promise<string> {
    return await this.ethers.getTokenURI(ltoNetworkId, nftInfo);
  }
  public async mintNFT(
    ltoNetworkId: 'L' | 'T',
    nftReceiverAddress: string,
    nftTokenURI: string,
    nftInfo: NftInfo,
  ): Promise<number> {
    return await this.ethers.mintNFT(
      ltoNetworkId,
      nftReceiverAddress,
      nftTokenURI,
      nftInfo,
    );
  }
  public async getBridgeCount(
    ltoNetworkId: 'L' | 'T',
    nftInfo: NftInfo,
  ): Promise<number> {
    return await this.ethers.getBridgeCount(ltoNetworkId, nftInfo);
  }
  public async getBridges(
    ltoNetworkId: 'L' | 'T',
    nftInfo: NftInfo,
  ): Promise<[string[], string[]]> {
    return await this.ethers.getBridges(ltoNetworkId, nftInfo);
  }
  public async getListOfNftIdsPerAddress(
    ltoNetworkId: 'L' | 'T',
    network: string,
    walletAddress: string,
  ): Promise<number[]> {
    return await this.ethers.getListOfNftIdsPerAddress(
      ltoNetworkId,
      network,
      walletAddress,
    );
  }
  public async transferNFT(
    ltoNetworkId: 'L' | 'T',
    nftReceiverAddress: string,
    nftInfo: NftInfo,
  ): Promise<string> {
    return await this.ethers.transferNFT(
      ltoNetworkId,
      nftReceiverAddress,
      nftInfo,
    );
  }

  /**
   * Get available NFT chains with their details
   * @returns Object with chain information
   */
  public async getAvailableNftChains(): Promise<any> {
    const nftInfoARB_L: NftInfo = {
      network: 'arbitrum',
      id: 0,
      address: this.config.get('eth.contracts.arbitrum.mainnet'),
    };

    const nftInfoARB_T: NftInfo = {
      network: 'arbitrum',
      id: 0,
      address: this.config.get('eth.contracts.arbitrum.testnet'),
    };

    const nftCountARB_L = await this.getNFTcount('L', nftInfoARB_L);
    const nftCountARB_T = await this.getNFTcount('T', nftInfoARB_T);

    const availableChains = {
      arbitrum: {
        mainnet: {
          name: 'arbitrum',
          logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
          smartContractAddress: this.config.get(
            'eth.contracts.arbitrum.mainnet',
          ),
          totalAmountNFTs: nftCountARB_L.toString(),
          templateCost: {
            1: (
              await this.queueService.getTemplateCostsIncludingPrevious(
                'L',
                'arbitrum',
                '1',
              )
            ).current,
            2: (
              await this.queueService.getTemplateCostsIncludingPrevious(
                'L',
                'arbitrum',
                '2',
              )
            ).current,
            3: (
              await this.queueService.getTemplateCostsIncludingPrevious(
                'L',
                'arbitrum',
                '3',
              )
            ).current,
          },
        },
        testnet: {
          name: 'arbitrum',
          logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
          smartContractAddress: this.config.get(
            'eth.contracts.arbitrum.testnet',
          ),
          totalAmountNFTs: nftCountARB_T.toString(),
          templateCost: {
            1: (
              await this.queueService.getTemplateCostsIncludingPrevious(
                'T',
                'arbitrum',
                '1',
              )
            ).current,
            2: (
              await this.queueService.getTemplateCostsIncludingPrevious(
                'T',
                'arbitrum',
                '2',
              )
            ).current,
            3: (
              await this.queueService.getTemplateCostsIncludingPrevious(
                'T',
                'arbitrum',
                '3',
              )
            ).current,
          },
        },
      },
    };

    return availableChains;
  }

  /**
   * Creates a new NFT for a digital asset
   * @param ltoNetworkId 'L' for mainnet, 'T' for testnet
   * @param jsonFile Ownable JSON data
   * @param requestId Request ID for logging
   * @returns NFT information
   */
  public async mintNewNft(
    ltoNetworkId: 'L' | 'T',
    jsonFile: any,
    requestId: string,
  ): Promise<NftInfo> {
    let nftNetwork: string;
    let nftContractAddress: string;

    if (jsonFile.NFT_BLOCKCHAIN === 'ethereum') {
      if (ltoNetworkId === 'L') {
        nftContractAddress = this.config.get('eth.contracts.ethereum.mainnet');
      } else {
        nftContractAddress = this.config.get('eth.contracts.ethereum.testnet');
      }
      nftNetwork = 'ethereum';
    } else if (jsonFile.NFT_BLOCKCHAIN === 'arbitrum') {
      if (ltoNetworkId === 'L') {
        nftContractAddress = this.config.get('eth.contracts.arbitrum.mainnet');
      } else {
        nftContractAddress = this.config.get('eth.contracts.arbitrum.testnet');
      }
      nftNetwork = 'arbitrum';
    } else if (jsonFile.NFT_BLOCKCHAIN === 'base') {
      if (ltoNetworkId === 'L') {
        nftContractAddress = this.config.get('eth.contracts.base.mainnet');
      } else {
        nftContractAddress = this.config.get('eth.contracts.base.testnet');
      }
      nftNetwork = 'base';
    } else {
      this.loggingService.logError(
        requestId,
        `Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`,
      );
      throw `Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`;
    }

    // Normalize contract address to ensure it's valid and checksummed
    nftContractAddress = ethers.getAddress(nftContractAddress.trim());

    this.loggingService.log(
      requestId,
      `minting NFT on ${nftNetwork} via NFT contract at: ${nftContractAddress}`,
    );

    let nftReceiverAddress: string;
    if (ltoNetworkId === 'L') {
      nftReceiverAddress = this.config.get(
        'eth.account.obridge_wallet_address.mainnet',
      );
    } else {
      nftReceiverAddress = this.config.get(
        'eth.account.obridge_wallet_address.testnet',
      );
    }

    nftReceiverAddress = ethers.getAddress(nftReceiverAddress.trim());

    const nftTokenURI = jsonFile.NFT_TOKEN_URI;

    console.log(
      `[NFT Create] Request: ${requestId}, Network: ${nftNetwork}, Contract: ${nftContractAddress}`,
    );
    console.log(`[NFT Create] Receiver: ${nftReceiverAddress}`);
    console.log(`[NFT Create] Token URI: ${nftTokenURI}`);
    this.loggingService.log(requestId, `nftOwner ${nftReceiverAddress}`);
    this.loggingService.log(requestId, `nftTokenURI ${nftTokenURI}`);
    this.loggingService.log(
      requestId,
      `NFT_BLOCKCHAIN ${jsonFile.NFT_BLOCKCHAIN}`,
    );

    const nftInfo: NftInfo = {
      network: nftNetwork,
      address: nftContractAddress,
      id: 0, // id is not used when minting a new NFT
    };

    let nftcount: number;
    try {
      nftcount = await this.mintNFT(
        ltoNetworkId,
        nftReceiverAddress,
        nftTokenURI,
        nftInfo,
      );
      nftcount = Number(await this.ethers.getNFTcount(ltoNetworkId, nftInfo));
    } catch (err) {
      this.loggingService.logError(requestId, `Minting new NFT failed ${err}`);
      throw err;
    }

    this.loggingService.log(requestId, `nftcount ${nftcount}`);
    nftInfo.id = nftcount;
    return nftInfo;
  }

  /**
   * Get template costs for all networks and templates
   * @param templateId Template ID
   * @returns Object with cost information
   */
  public async getTemplateCosts(templateId: number): Promise<any> {
    if (!(templateId > 0 && templateId < 4)) {
      throw `Template ID must be between 1 and 3`;
    }

    // Force a price update and wait for it to complete
    try {
      await this.coinmarketcapService.getLatestPrice(true);

      // Add a small delay to ensure values propagate
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get the updated costs after forced update for Base blockchain
      const main = await this.queueService.getTemplateCostsIncludingPrevious(
        'L',
        'base',
        templateId.toString(),
      );
      const test = await this.queueService.getTemplateCostsIncludingPrevious(
        'T',
        'base',
        templateId.toString(),
      );

      console.log('DEBUG - main:', JSON.stringify(main, null, 2));
      console.log('DEBUG - test:', JSON.stringify(test, null, 2));
      console.log('DEBUG - main.current:', main.current);
      console.log('DEBUG - test.current:', test.current);

      return {
        L: {
          base: {
            ETH: main.current.usd || '0.001',
            last: main.current.last || '0',
            prev: main.current.prev || '0',
            timestamp: main.current.timestamp || 0,
          },
        },
        T: {
          base: {
            ETH: test.current.usd || '0.001',
            last: test.current.last || '0',
            prev: test.current.prev || '0',
            timestamp: test.current.timestamp || 0,
          },
        },
      };
    } catch (error) {
      console.error('Error getting template costs:', error);
      return {
        L: {
          base: '20000000',
        },
        T: {
          base: '20000000',
        },
      };
    }
  }
}
