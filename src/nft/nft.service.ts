import { Injectable } from '@nestjs/common';
import { EthersService } from '../ethers/ethers.service';
import { NftInfo } from '../interfaces/OwnableInfo';
import { ConfigService } from '../config/config.service';
import { LoggingService } from '../logging/logging.service';
import { QueueService } from '../queue/queue.service';
import { CoinmarketcapService } from '../coinmarketcap/coinmarketcap.service';
@Injectable()
export class NFTService {
	constructor(private ethers: EthersService,
		private readonly config: ConfigService,
		private readonly loggingService: LoggingService,
		private readonly queueService: QueueService,
		private readonly coinmarketcapService: CoinmarketcapService) { }


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
					smartContractAddress: this.config.get('eth.contracts.arbitrum.mainnet'),
					totalAmountNFTs: nftCountARB_L.toString(),
					templateCost: {
						1: this.queueService.getTemplateCosts('L', 'arbitrum', '1'),
						2: this.queueService.getTemplateCosts('L', 'arbitrum', '2'),
						3: this.queueService.getTemplateCosts('L', 'arbitrum', '3')
					}
				},
				testnet: {
					name: 'arbitrum',
					logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
					smartContractAddress: this.config.get('eth.contracts.arbitrum.testnet'),
					totalAmountNFTs: nftCountARB_T.toString(),
					templateCost: {
						1: this.queueService.getTemplateCosts('T', 'arbitrum', '1'),
						2: this.queueService.getTemplateCosts('T', 'arbitrum', '2'),
						3: this.queueService.getTemplateCosts('T', 'arbitrum', '3')
					}
				}
			}
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
	public async mintNewNft(ltoNetworkId: 'L' | 'T', jsonFile: any, requestId: string): Promise<NftInfo> {
		let nftNetwork: string;
		let nftContractAddress: string;

		if (jsonFile.NFT_BLOCKCHAIN === 'ethereum') {
			if (ltoNetworkId === 'L') {
				nftContractAddress = this.config.get('eth.contracts.ethereum.mainnet');
			} else {
				nftContractAddress = this.config.get('eth.contracts.ethereum.testnet');
			}
			nftNetwork = "ethereum";
		} else if (jsonFile.NFT_BLOCKCHAIN === 'arbitrum') {
			if (ltoNetworkId === 'L') {
				nftContractAddress = this.config.get('eth.contracts.arbitrum.mainnet');
			} else {
				nftContractAddress = this.config.get('eth.contracts.arbitrum.testnet');
			}
			nftNetwork = "arbitrum";
		} else {
			this.loggingService.logError(requestId, `Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`);
			throw (`Unsupported Blockchain: ${jsonFile.NFT_BLOCKCHAIN}`);
		}

		this.loggingService.log(requestId, `minting NFT on ${nftNetwork} via NFT contract at: ${nftContractAddress}`);

		let nftReceiverAddress: string;
		if (ltoNetworkId === 'L') {
			nftReceiverAddress = this.config.get('eth.account.obridge_wallet_address.mainnet');
		} else {
			nftReceiverAddress = this.config.get('eth.account.obridge_wallet_address.testnet');
		}

		const nftTokenURI = jsonFile.NFT_TOKEN_URI;

		this.loggingService.log(requestId, `nftOwner ${nftReceiverAddress}`);
		this.loggingService.log(requestId, `nftTokenURI ${nftTokenURI}`);
		this.loggingService.log(requestId, `NFT_BLOCKCHAIN ${jsonFile.NFT_BLOCKCHAIN}`);

		const nftInfo: NftInfo = {
			network: nftNetwork,
			address: nftContractAddress,
			id: 0,  // id is not used when minting a new NFT
		};

		let nftcount: number;
		try {
			nftcount = await this.mintNFT(ltoNetworkId, nftReceiverAddress, nftTokenURI, nftInfo);
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
	  throw (`Template ID must be between 1 and 3`);
	}
	
	// Force a price update and wait for it to complete
	try {
	  await this.coinmarketcapService.getLatestPrice(true);
	  
	  // Add a small delay to ensure values propagate
	  await new Promise(resolve => setTimeout(resolve, 500));
	  
	  // Get the updated costs after forced update
	  const main = this.queueService.getTemplateCosts('L', 'arbitrum', templateId.toString());
	  const test = this.queueService.getTemplateCosts('T', 'arbitrum', templateId.toString());
	  
	  return {
		'L': {
		  'arbitrum': main
		},
		'T': {
		  'arbitrum': test
		}
	  };
	} catch (error) {
	  console.error("Error getting template costs:", error);
	  // Return default values if there's an error
	  return {
		'L': {
		  'arbitrum': "20000000" 
		},
		'T': {
		  'arbitrum': "20000000"
		}
	  };
	}
  }
}
