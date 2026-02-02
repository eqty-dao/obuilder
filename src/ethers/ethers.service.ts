import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { ConfigService } from '../config/config.service';
import { NftInfo } from '../interfaces/OwnableInfo';
import { DataError } from '../interfaces/error';
import * as abis from './abi';


@Injectable()
export class EthersService implements OnModuleInit {

	constructor(private config: ConfigService) { }

	onModuleInit(): void {

	}

	// public signMessage(message: string | Uint8Array): Promise<string> {
	//   return this.signer.signMessage(message);
	// }
	private async getBalance(ltoNetworkId: 'L' | 'T', evmNetworkName: string): Promise<string> {
		const alchemyProvider = new ethers.AlchemyProvider(...this.getNetwork(ltoNetworkId, evmNetworkName));
		const signer: ethers.HDNodeWallet = this.getSigner(ltoNetworkId, evmNetworkName);
		const balance = ethers.formatUnits(await alchemyProvider.getBalance(signer.address), 'ether').toString();
		return balance;
	}
	private getSigner(ltoNetworkId: 'L' | 'T', evmNetworkName: string): ethers.HDNodeWallet {

		const alchemyProvider = new ethers.AlchemyProvider(...this.getNetwork(ltoNetworkId, evmNetworkName));
		let signer: ethers.HDNodeWallet;
		if (ltoNetworkId === 'L') {
			signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic.mainnet'), alchemyProvider);
		} else {
			signer = ethers.Wallet.fromPhrase(this.config.get('eth.account.mnemonic.testnet'), alchemyProvider);
		}
		return signer;
	}

	private getNetwork(ltoNetworkId: 'L' | 'T', evmNetworkName: string): [ethers.Networkish, string] {
		// https://docs.ethers.org/v6/api/providers/thirdparty/#AlchemyProvider

		// const networkId = this.config.get('lto.networkId');
		switch (evmNetworkName) {
			case 'ethereum':
				if (ltoNetworkId === 'T')
					return [{ name: 'sepolia', chainId: 11155111 }, this.config.get('eth.account.eth_alchemy_api_key')]; // Sepolia Testnet
				else return [{ name: 'mainnet', chainId: 1 }, this.config.get('eth.account.eth_alchemy_api_key')]; // Ethereum Mainnet
			case 'arbitrum':
				if (ltoNetworkId === 'T')
					// Arbitrum Sepolia Testnet
					return [{ name: 'arbitrum-sepolia', chainId: 421614 }, this.config.get('eth.account.arbitrum_alchemy_api_key')];
				else return [{ name: 'arbitrum', chainId: 42161 }, this.config.get('eth.account.arbitrum_alchemy_api_key')]; // Arbitrum Mainnet
			case 'polygon':
				if (ltoNetworkId === 'T')
					return [{ name: 'matic-amoy', chainId: 80002 }, this.config.get('eth.account.polygon_alchemy_api_key')]; // Polygon Amoy Testnet
				else return [{ name: 'matic', chainId: 137 }, this.config.get('eth.account.polygon_alchemy_api_key')]; // Polygon mainnet
			// case 'base':
			//   if (networkId === 'T') return ['base-sepolia', 84532,this.config.get('eth.account.base_alchemy_api_key')]; // Base Sepolia Testnet
			//   else return ['base', 8453,this.config.get('eth.account.base_alchemy_api_key')]; // Base mainnet
			default:
				throw new Error(`Unsupported EVM network: ${evmNetworkName}. Supported: ethereum, arbitrum, polygon`);
		}
	}

	private getContract(ltoNetworkId: 'L' | 'T', type: keyof typeof abis, networkName: string, address: string): ethers.Contract {
		if (!(type in abis)) throw new Error(`No ABI for ${type}`);

		let signer: ethers.HDNodeWallet;
		signer = this.getSigner(ltoNetworkId, networkName);

		const nftContract: ethers.Contract = new ethers.Contract(address, abis[type], signer);
		return nftContract;
	}

	public getEvmWalletAddresses(networkName: string): [string, string] {
		let signer_L: ethers.HDNodeWallet;
		let signer_T: ethers.HDNodeWallet;
		signer_L = this.getSigner('L', networkName);
		signer_T = this.getSigner('T', networkName);

		return [signer_L.address.toString(), signer_T.address.toString()];

	}
	public isEVMAddress(_address: string): boolean {
		return ethers.isAddress(_address);
	}
	public async getNFTcount(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<string> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);

		return (await nftContract.getNftCount()).toString();
	}
	public async getOwnerOfNFT(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<string> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		return (await nftContract.ownerOf(nft.id.toString())).toString();
	}
	public async isBridge(ltoNetworkId: 'L' | 'T', bridgeAddress: string, nft: NftInfo): Promise<boolean> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		return await nftContract.isBridge(bridgeAddress);
	}
	public async getBridgeBaseURI(ltoNetworkId: 'L' | 'T', bridgeAddress: string, nft: NftInfo): Promise<string> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		return await nftContract.getBridgeBaseURI(bridgeAddress);
	}
	public async getServerETHBalance(ltoNetworkId: 'L' | 'T', networkName: string): Promise<string> {
		return await this.getBalance(ltoNetworkId, networkName);
	}

	public async getTokenURI(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<string> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		return await nftContract.getTokenURI(nft.id);
	}
	public async mintNFT(ltoNetworkId: 'L' | 'T', nftReceiverAddress: string, nftTokenURI: string, nft: NftInfo): Promise<number> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		try {
			const response = await nftContract.mint(nftReceiverAddress, nftTokenURI);
			await response.wait();
			const nftcount = await nftContract.getNftCount();
			return Number(nftcount.toString());
		} catch (err) {
			throw new DataError(err);
		}
	}
	public async getBridgeCount(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<number> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		return await nftContract.getBridgeCount();
	}
	public async getBridges(ltoNetworkId: 'L' | 'T', nft: NftInfo): Promise<[string[], string[]]> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		return await nftContract.getBridges();
	}
	public async getListOfNftIdsPerAddress(ltoNetworkId: 'L' | 'T', evmNetwork: string, walletAddress: string): Promise<number[]> {

		let smartContractAddress: string;
		if (evmNetwork === 'ethereum') {
			if (ltoNetworkId === 'L') {
				smartContractAddress = this.config.get('eth.contracts.ethereum.mainnet');
			} else {
				smartContractAddress = this.config.get('eth.contracts.ethereum.testnet');
			}
		} else if (evmNetwork === 'arbitrum') {
			if (ltoNetworkId === 'L') {
				smartContractAddress = this.config.get('eth.contracts.arbitrum.mainnet');
			} else {
				smartContractAddress = this.config.get('eth.contracts.arbitrum.testnet');
			}
		} else {
			throw new DataError(`Unknown EVM Network ${evmNetwork}. Possible options: ethereum or arbitrum`);
		}
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', evmNetwork, smartContractAddress);
		return await nftContract.getListOfNftIdsPerAddress(walletAddress);
	}

	public async transferNFT(ltoNetworkId: 'L' | 'T', nftReceiverAddress: string, nft: NftInfo): Promise<string> {
		const nftContract = this.getContract(ltoNetworkId, 'OBridgeNFT', nft.network, nft.address);
		let signer: ethers.HDNodeWallet;
		signer = this.getSigner(ltoNetworkId, nft.network);
		try {
			const response = await nftContract.transferFrom(signer.address, nftReceiverAddress, nft.id);
			await response.wait();
			return (await nftContract.ownerOf(nft.id.toString())).toString();
		} catch (err) {
			throw new DataError(err);
		}
	}
}
