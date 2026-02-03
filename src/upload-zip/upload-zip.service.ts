import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import arrayToString from '../utils/arrayToString';
import JSZip from 'jszip';
import fileExists from '../utils/fileExists';
import path from 'path';
// import { catchError, firstValueFrom } from 'rxjs';
// import { AxiosError } from 'axios';
// LTO network no longer exists - using EqtyService for Base blockchain
import { exec } from 'child_process';
// import chokidar from 'chokidar';
import { NftInfo, OwnableInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { TypedPackage } from "../interfaces/TypedPackage";
// IEventChainJSON replaced by eqty-core types
import { Blob } from 'buffer';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { PinataSDK } from "pinata";
import { Request, Response } from 'express';
// EIP-712 signatures used via EqtyService for Ethereum signing

import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';
import { NFTService } from 'src/nft/nft.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { UserError } from 'src/interfaces/error';
import { QueueService } from 'src/queue/queue.service';
import { LoggingService } from 'src/logging/logging.service';

import { S3Service } from '../s3/s3.service';
import { CoinmarketcapService } from 'src/coinmarketcap/coinmarketcap.service';
import { JsonFile } from 'src/interfaces/JsonFile';
import { EqtyService } from 'src/eqty/eqty.service';

// Extracted services for better separation of concerns
import { OwnableValidationService, OwnableStorageService, OwnableRelayService, OwnableBuilderService } from './services';

@Injectable()
export class UploadZipService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(UploadZipService.name);
	// private pathToRids: string;
	private pathToCids: string;
	private pathToTemplates: string;
	private packageInfo: any;
	private intervalId: NodeJS.Timeout;

	private nodeVersion = process.version;
	private pinata: PinataSDK;
	// private jsonArrayOwnables: string[] = [];


	constructor(
		private readonly httpService: HttpService,
		private readonly config: ConfigService,
		private readonly nft: NFTService,
		private readonly queueService: QueueService,
		private readonly s3: S3Service,
		private readonly coinmarketcap: CoinmarketcapService,
		private readonly loggingService: LoggingService,
		private readonly telegramService: TelegramBotService,
		private readonly eqtyService: EqtyService,
		@Inject('IPFS') private readonly ipfs: IPFS,
		// Extracted services
		private readonly validation: OwnableValidationService,
		private readonly storage: OwnableStorageService,
		private readonly relay: OwnableRelayService,
		private readonly builder: OwnableBuilderService,
	) {

	}

	async onModuleInit() {
		await this.config.load();

		this.pinata = new PinataSDK({
			pinataJwt: this.config.get('pinata.jwt'), // process.env.PINATA_JWT!,
			pinataGateway: this.config.get('pinata.gateway') // "example-gateway.mypinata.cloud",
		});
		this.packageInfo = require('../../package.json');
		// this.pathToRids = this.packageInfo.ownableRidPath;
		this.pathToCids = this.packageInfo.ownableCidPath;
		this.pathToTemplates = this.packageInfo.ownableTemplatesPath;
		// mkdirSync(this.pathToRids, { recursive: true });
		mkdirSync(this.pathToCids, { recursive: true });
		this.intervalId = setInterval(async () => {
			try {
				await this.checkQueueStatus();
			}
			catch (err) {
				this.logger.error(`ERROR QUEUE STATUS: ${err}`);
			}
		}, 15000); // 10000 ms = 10 seconds
	}

	// Stop the interval when the application shuts down
	onModuleDestroy() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
		}
	}


	public async GetServerETHBalance(ltoNetworkId: 'L' | 'T', networkName: string): Promise<string> {
		const balance = await this.nft.getServerETHBalance(ltoNetworkId, networkName);
		const numericBalance = parseFloat(balance);

		if (numericBalance <= 0.01) { // TODO: this comparison should be networkName specific
			// Handle case where balance is below or equal to 0.1
			this.logger.warn(`Balance is low: ${numericBalance}`);
			await this.telegramService.sendMessageToTelegramBot(ltoNetworkId, `\n${networkName}: Balance is low: ${numericBalance}`);
		}


		return balance;
	}
	/**
	 * Get EQTY account address for a network
	 * @param networkType 'mainnet' or 'testnet' (or legacy 'L'/'T')
	 */
	public getEqtyAddress(networkType: 'mainnet' | 'testnet' | 'L' | 'T'): string {
		const type = networkType === 'L' ? 'mainnet' : networkType === 'T' ? 'testnet' : networkType;
		return this.eqtyService.getAddress(type);
	}

	public isEVMAddress(address: string): boolean {
		return this.nft.isEVMAddress(address);
	}

	/**
	 * Validate Ethereum address
	 * Returns 'mainnet' for valid addresses, 'false' otherwise
	 */
	public isValidAddress(address: string): string {
		if (this.eqtyService.isValidAddress(address)) {
			return 'mainnet'; // Valid Ethereum address
		}
		return 'false';
	}
	/**
	 * Get EQTY/ETH balance for Base blockchain
	 * @param networkType 'mainnet' or 'testnet'
	 */
	public async getEqtyBalance(networkType: 'mainnet' | 'testnet') {
		const balance = await this.eqtyService.getBalance(networkType);
		return { balance: balance.toString() };
	}

	/**
	 * Send file via relay
	 * @deprecated LTO network no longer exists - use sendOwnableBase instead
	 */
	public async sendFile(relay: any, content: Uint8Array, sender: any, recipient: string, rid: string) {
		// LTO network no longer exists - use EqtyService Message/Relay
		if (!this.eqtyService.isValidAddress(recipient)) {
			this.loggingService.logError(rid, `Invalid Ethereum address: ${recipient}`);
			throw new Error(`Invalid Ethereum address. LTO network no longer exists.`);
		}

		const networkType = this.getNetworkType();

		try {
			this.loggingService.log(rid, `Sending file via Base ${networkType} to recipient: ${recipient}`);

			const { message, hash } = await this.eqtyService.createAndSendMessage(
				content,
				recipient,
				networkType,
				undefined,
				'application/octet-stream'
			);

			this.loggingService.log(rid, `Message hash: ${hash}`);
			this.loggingService.log(rid, `Ownable successfully sent to Relay via Base. Setting Queue status to sent.`);

			// Use 'L' for mainnet, 'T' for testnet for queue compat
			const networkId = networkType === 'mainnet' ? 'L' : 'T';
			await this.queueService.setQueueEntryStatus(networkId as 'L' | 'T', rid, OwnableStatus.Sent, hash);
		} catch (err) {
			this.loggingService.logError(rid, `Error sending via Base: ${err}`);
			throw err;
		}
	}

	public getLogsByRequestId(requestId: string): { rid: string, level: string, message: string, timestamp: Date }[] {
		return this.loggingService.getLogsByRid(requestId);
	}

	private getRelayUrl(): string {
		// Delegated to OwnableRelayService
		return this.relay.getRelayUrl();
	}

	private async isRelayUp(url: string | undefined): Promise<boolean> {
		// Delegated to OwnableRelayService
		return this.relay.isRelayUp(url);
	}

	public async isRelayServerUp(): Promise<string> {
		// Delegated to OwnableRelayService
		return this.relay.isRelayServerUp();
	}
	/**
	 * Send Ownable to recipient
	 * @deprecated LTO network no longer exists - use sendOwnableBase instead
	 */
	public async sendOwnable(ltoNetworkId: 'L' | 'T', rid: string, recipient: string, content?: Uint8Array) {
		// LTO network no longer exists - all addresses must be Ethereum addresses
		if (!this.eqtyService.isValidAddress(recipient)) {
			this.loggingService.logError(rid, `Invalid Ethereum address: ${recipient}. LTO network no longer exists.`);
			throw new Error(`Invalid Ethereum address: ${recipient}. LTO network no longer exists.`);
		}

		// Map old LTO network IDs to new network types
		const networkType = ltoNetworkId === 'L' ? 'mainnet' : 'testnet';

		await this.sendOwnableBase(networkType, rid, recipient, content);
	}

	/**
	 * Send Ownable via Base blockchain using eqty-core Message/Relay
	 * This is the EVM-native replacement for sendOwnable
	 * @param networkType 'mainnet' for Base, 'testnet' for Base Sepolia
	 * @param rid Request ID for logging
	 * @param recipient Ethereum address (0x...) of the recipient
	 * @param content Ownable content as Uint8Array
	 */
	public async sendOwnableBase(
		networkType: 'mainnet' | 'testnet',
		rid: string,
		recipient: string,
		content?: Uint8Array
	): Promise<void> {
		// Validate Ethereum address
		if (!this.eqtyService.isValidAddress(recipient)) {
			this.loggingService.logError(rid, `Invalid Ethereum address: ${recipient}`);
			throw new Error(`Invalid Ethereum address: ${recipient}. Expected 0x-prefixed hex address.`);
		}

		const senderAddress = this.eqtyService.getAddress(networkType);
		const relayUrl: string = (this.config as any).get('eqty.relayUrl') || 'https://relay.eqty.io';

		this.loggingService.log(rid, `Sending Ownable via Base ${networkType}... RELAY:${relayUrl} RECIPIENT:${recipient} RID:${rid}`);

		if (!content) {
			this.loggingService.logError(rid, `No content provided for ownable`);
			throw new Error('No content provided for ownable');
		}

		try {
			this.loggingService.log(rid, `Try sending file... SENDER:${senderAddress} RECIPIENT:${recipient} RID:${rid}`);

			// Create and sign message using EqtyService
			const { message, hash } = await this.eqtyService.createAndSendMessage(
				content,
				recipient,
				networkType,
				relayUrl,
				'application/octet-stream'
			);

			this.loggingService.log(rid, `Message hash: ${hash}`);
			this.loggingService.log(rid, `Ownable successfully sent to Relay via Base ${networkType}. Setting Queue status to sent.`);

			// Update queue status with network type indicator
			const networkId = networkType === 'mainnet' ? 'L' : 'T'; // Temporary: use L/T for queue compat
			await this.queueService.setQueueEntryStatus(networkId, rid, OwnableStatus.Sent, hash);

		} catch (error) {
			this.loggingService.logError(rid, `Error sending message via Base: ${error}`);
			throw new Error(`Error sending message via Base: ${error}`);
		}
	}

	private async checkReuseOfTxId(ltoTransactionId: string, requestId: string) {
		this.loggingService.log(requestId, `Checking if TX ID ${ltoTransactionId} has already been used for a previous request`);
		const [previousRequestId, networkID] = this.queueService.getRequestIdByTxId(ltoTransactionId);
		// DONE
		if (previousRequestId != null && previousRequestId !== requestId) {
			this.loggingService.logError(requestId, `LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId} on LTO network ${networkID}`);
			throw (`LTO TX ID ${ltoTransactionId} has already been used with request ID: ${previousRequestId} on LTO network ${networkID}`);
		}
	}

	/**
	 * @deprecated LTO network no longer exists. Transaction verification should use Base blockchain.
	 * This method is kept for backwards compatibility but will throw an error.
	 */
	private async checkLtoTransactionId(ltoNetworkId: 'L' | 'T', ltoTransactionId: string, templateId: number, chain: string, requestId: string, reenqueued: boolean): Promise<TransactionIdData> {
		// LTO network no longer exists - cannot verify LTO transactions
		this.loggingService.logError(requestId, `LTO transaction verification is deprecated. Use Base blockchain instead.`);

		// For backwards compatibility, return a mock response if reenqueued
		if (reenqueued) {
			this.loggingService.log(requestId, `Reenqueued request - skipping LTO transaction verification`);
			return {
				type: 4,
				sender: ltoTransactionId, // Use txId as placeholder
				recipient: this.eqtyService.getAddress('mainnet'),
				amount: 0,
			};
		}

		throw new Error(`LTO network no longer exists. Transaction verification unavailable. Use Base blockchain.`);
	}

	public async getAvailableNftChains(): Promise<JSON> {
		// const nftInfoETH_L: NftInfo = {
		//   network: 'ethereum',
		//   id: 0,
		//   address: this.config.get('eth.contracts.ethereum.mainnet'),
		// };

		const nftInfoARB_L: NftInfo = {
			network: 'arbitrum',
			id: 0,
			address: this.config.get('eth.contracts.arbitrum.mainnet'),
		};
		// const nftInfoETH_T: NftInfo = {
		//   network: 'ethereum',
		//   id: 0,
		//   address: this.config.get('eth.contracts.ethereum.testnet'),
		// };

		const nftInfoARB_T: NftInfo = {
			network: 'arbitrum',
			id: 0,
			address: this.config.get('eth.contracts.arbitrum.testnet'),
		};


		// const nftCountETH_L = await this.nft.getNFTcount('L', nftInfoETH_L);
		const nftCountARB_L = await this.nft.getNFTcount('L', nftInfoARB_L);
		// const nftCountETH_T = await this.nft.getNFTcount('T', nftInfoETH_T);
		const nftCountARB_T = await this.nft.getNFTcount('T', nftInfoARB_T);
		// const nftCountPOL = await this.nft.getNFTcount(nftInfoPOL);

		const availableChains = {
			//   ethereum: {
			//     // mainnet: {
			//     //   name: 'ethereum',
			//     //   logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/ethereum-eth-logo.png',
			//     //   smartContractAddress: this.config.get('eth.contracts.ethereum.mainnet'),
			//     //   totalAmountNFTs: nftCountETH_L.toString(),
			//     //   templateCost: {
			//     //     1: this.queueService.getTemplateCosts('L','ethereum', '1')
			//     //   }
			//     // },
			//     testnet: {
			//       name: 'ethereum',
			//       logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/ethereum-eth-logo.png',
			//       smartContractAddress: this.config.get('eth.contracts.ethereum.testnet'),
			//       totalAmountNFTs: nftCountETH_T.toString(),
			//       templateCost: {
			//         1: this.queueService.getTemplateCosts('T', 'ethereum', '1')
			//       }
			//     }
			//   },
			arbitrum: {
				mainnet: {
					name: 'arbitrum',
					logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
					smartContractAddress: this.config.get('eth.contracts.arbitrum.mainnet'),
					totalAmountNFTs: nftCountARB_L.toString(),
					templateCost: {
						1: this.queueService.getTemplateCosts('L', 'arbitrum', '1')
					}
				},
				testnet: {
					name: 'arbitrum',
					logo: 'https://obuilderassets.s3.eu-west-1.amazonaws.com/arbitrum-arb-logo.png',
					smartContractAddress: this.config.get('eth.contracts.arbitrum.testnet'),
					totalAmountNFTs: nftCountARB_T.toString(),
					templateCost: {
						1: this.queueService.getTemplateCosts('T', 'arbitrum', '1')
					}
				}
			}
		};

		return JSON.parse(JSON.stringify(availableChains));
	}


	/**
	 * Create an event chain for an ownable
	 * LTO network no longer exists - this method now uses Base blockchain via eqty-core
	 * @deprecated Use createEventChainBase directly for new code
	 */
	private async createEventChain(pkg: TypedPackage, nftInfo: NftInfo, receiver: string): Promise<Buffer> {
		// LTO network no longer exists - all addresses must be Ethereum addresses
		const networkType = this.getNetworkType();

		if (!this.eqtyService.isValidAddress(receiver)) {
			this.loggingService.logError(pkg.cid, `Invalid address format. Expected Ethereum address (0x...), got: ${receiver}`);
			throw new Error(`Invalid address format. LTO network no longer exists. Expected Ethereum address (0x...), got: ${receiver}`);
		}

		return this.createEventChainBase(pkg, nftInfo, receiver, networkType);
	}

	/**
	 * Determine network type from configuration
	 * @deprecated LTO network no longer exists - use 'mainnet' or 'testnet' for Base
	 */
	private getNetworkType(): 'mainnet' | 'testnet' {
		const useMainnet = (this.config as any).get('eqty.useMainnet') || false;
		return useMainnet ? 'mainnet' : 'testnet';
	}

	/**
	 * Create an event chain for Base blockchain using eqty-core
	 * This is the EVM-native replacement for createEventChain
	 * @param pkg The ownable package
	 * @param nftInfo NFT information
	 * @param receiver Ethereum address (0x...) of the receiver
	 * @param networkType 'mainnet' for Base, 'testnet' for Base Sepolia
	 */
	private async createEventChainBase(
		pkg: TypedPackage,
		nftInfo: NftInfo,
		receiver: string,
		networkType: 'mainnet' | 'testnet' = 'testnet'
	): Promise<Buffer> {
		// Delegated to OwnableBuilderService
		return this.builder.createEventChainBase(pkg, nftInfo, receiver, networkType, this.pathToCids);
	}


	public getServerWalletAddresses(): [string, string] {
		return [this.getEqtyAddress('mainnet'), this.getEqtyAddress('testnet')];
	}
	public getServerEVMwalletAddresses(networkName: string): [string, string] {
		return this.nft.getEvmWalletAddresses(networkName);
	}

	/**
	 * Get Base blockchain wallet addresses for mainnet and testnet
	 */
	public getServerBaseWalletAddresses(): [string, string] {
		return [
			this.eqtyService.getAddress('mainnet'),
			this.eqtyService.getAddress('testnet')
		];
	}

	public async templateCost(templateId: number): Promise<any> {
		//console.log("templateId", templateId, "chain", chain, " cost: ", this.packageInfo.templateCost[chain][templateId]);
		// if (this.packageInfo.templateCost[chain.toString()][templateId] === undefined) {
		//   throw (`Undefined Template cost for template number ${templateId} and chain: ${chain}`);
		// }
		if (templateId != 1) {
			throw (`Currently only Template ID 1 is support`);
		}
		await this.coinmarketcap.getLatestPrice();
		const main = this.queueService.getTemplateCosts('L', 'arbitrum', '1');
		const test = this.queueService.getTemplateCosts('T', 'arbitrum', '1');
		this.logger.debug(`templateCost main: ${JSON.stringify(main)}`);
		this.logger.debug(`templateCost test: ${JSON.stringify(test)}`);
		return {
			'L': {
				'arbitrum': main
			},
			'T': {
				'arbitrum': test
			}
			// 'ethereum': (this.packageInfo.templateCost.ethereum[templateId]).toString(),
			// 'arbitrum': (this.packageInfo.templateCost.arbitrum[templateId]).toString(),
			//'polygon': (this.packageInfo.templateCost.polygon[templateId]).toString()
		}

	}

	private async readOwnableDataFromZip(files: Map<string, Buffer>) {
		try {
			return JSON.parse(files.get('ownableData.json').toString())[0];
		} catch (error) {
			throw (`Failed to read JSON file ownableData.json`);
		}
	}


	public async createPinataPinnedFile(picture: Buffer, name: string, description: string): Promise<string> {
		// Delegated to OwnableBuilderService
		return this.builder.createPinataPinnedFile(picture, name, description);
	}
	private async mintNewNft(ltoNetworkId: 'L' | 'T', jsonFile: any, requestId: string): Promise<NftInfo> {
		// Delegated to OwnableBuilderService
		return this.builder.mintNewNft(ltoNetworkId, jsonFile, requestId);
	}
	/**
	 * Extract signer address from EIP-712 signed request
	 * The EIP712Guard already verifies the signature and attaches signerAddress to request
	 */
	private async getSignerOfRequest(req: Request, networkType: 'L' | 'T' | 'mainnet' | 'testnet'): Promise<string> {
		// EIP712Guard already validated and attached the signer address
		const signerAddress = (req as any).signerAddress;

		if (signerAddress && this.eqtyService.isValidAddress(signerAddress)) {
			this.logger.debug(`Extracted signer from EIP-712 request: ${signerAddress}`);
			return signerAddress;
		}

		// Fallback: check for x-wallet-address header (for testing/migration)
		const walletAddress = req.headers['x-wallet-address'] as string;
		if (walletAddress && this.eqtyService.isValidAddress(walletAddress)) {
			this.logger.warn(`Using x-wallet-address header (migration mode): ${walletAddress}`);
			return walletAddress;
		}

		throw new UserError(
			`No valid signer found in request. Ensure request is signed with EIP-712 or x-wallet-address header is provided.`
		);
	}
	public async queueRequest(ltoNetworkId: 'L' | 'T', uint8ArrayData: Uint8Array, templateId: number, req: Request): Promise<any> {
		let signerAccountAddress: string;
		// let ltoNetworkId: 'L' | 'T';
		try {
			signerAccountAddress = await this.getSignerOfRequest(req, ltoNetworkId);
			this.logger.debug(`signerAccountAddress: ${signerAccountAddress}`);
			this.logger.debug(`signerAddress: ${signerAccountAddress} (LTO network no longer exists)`);
			// if (getNetwork(signerAccountAddress) === 'L') {
			//   ltoNetworkId = 'L';
			// } else if (getNetwork(signerAccountAddress) === 'T') {
			//   ltoNetworkId = 'T';

			// } else {
			//   new Error(`Error: Not able to get networkId from ${signerAccountAddress}`);
			// }
		} catch (err) {
			throw err;
		}


		const relayURL = this.getRelayUrl();
		const isUp: boolean = await this.isRelayUp(relayURL);
		if (isUp) {
			this.logger.debug(`oRelay Server ${relayURL} is up and running!`);
		}
		else {
			throw new Error(`Error: oRelay Server ${relayURL} is down`);
		}

		if (!this.queueService.isQueueingAllowed(ltoNetworkId)) {
			throw new Error('Queueing of new Requests currently disabled!');
		}

		this.logger.debug('unzipping user input file into memory...');
		const requestIdFiles = await this.unzip(uint8ArrayData);

		const timeMillisecondsNow = Date.now().toString();
		requestIdFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

		this.logger.debug(`requestIdFiles: ${requestIdFiles}`);
		this.logger.debug('getting request ID of input requestIdFiles...');

		const requestId: string = await this.getUniqueId(requestIdFiles);
		this.loggingService.log(requestId, `New Logging Service added for unique request ID: ${requestId}`);


		if (!requestIdFiles.has('ownableData.json')) {
			this.loggingService.logError(requestId, "Invalid package: 'ownableData.json' is missing");
			throw new Error("Invalid package: 'ownableData.json' is missing");
		}

		this.loggingService.log(requestId, "reading JSON info data from zip for Ownable modification...");
		let jsonFile;
		try {
			jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
		} catch (err) {
			this.loggingService.logError(requestId, `${err}`);
			throw err;
		}

		if (jsonFile.CREATE_NFT === 'true') {
			//   if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') && !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')) {
			if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum')) {
				this.loggingService.logError(requestId, `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
				throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
			}
		} else {
			jsonFile.NFT_BLOCKCHAIN = 'noNFT';
		}

		const thisServerAddress = this.getEqtyAddress(ltoNetworkId);
		this.loggingService.log(requestId, `EQTY ACCOUNT: ${thisServerAddress}`);
		this.loggingService.log(requestId, `Checking transaction ID: ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}`);


		await this.wait(10000);
		let transactionIdData: TransactionIdData;
		try {
			transactionIdData = await this.checkLtoTransactionId(ltoNetworkId, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId, jsonFile.NFT_BLOCKCHAIN, requestId, false);
			this.loggingService.log(requestId, `transactionIdData:` + JSON.stringify(transactionIdData));
		} catch (err) {
			this.loggingService.logError(requestId, `${err}`);
			throw new Error(err);
		}

		// TODO:
		if (signerAccountAddress !== transactionIdData.sender) {
			throw new UserError(`Error: Signer of Ownable request ${signerAccountAddress} did not sign transactionID ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}. Signer of TXID:${transactionIdData.sender}`);
		}
		let entry: QueueEntry;
		try {
			entry = await this.queueService.enqueue(ltoNetworkId, requestId, uint8ArrayData, transactionIdData.sender, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId);
			this.loggingService.log(requestId, `Added successfully new entry to queue ` + JSON.stringify(entry));
		} catch (err) {
			this.loggingService.logError(requestId, `${err}`);
			throw err;
		}

		return entry;
	}


	private async checkForFailedEntries(ltoNetworkId: 'L' | 'T') {
		const queryProcessingEntry: QueueEntry[] = this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
		if (Array.isArray(queryProcessingEntry) && queryProcessingEntry.length > 0) {
			const firstEntry = queryProcessingEntry[0];
			if (firstEntry.rid && firstEntry.rid !== '') {
				this.loggingService.log(firstEntry.rid, `First Entry: ` + JSON.stringify(firstEntry));
			}

			const timestampNow = Math.floor(Date.now() / 1000);
			if (firstEntry.rid && firstEntry.rid !== '' && this.queueService.isCreatingOwnable() && firstEntry.timestampProcessing > 0 && timestampNow - queryProcessingEntry[0].timestampProcessing >= 300) {
				this.loggingService.log(firstEntry.rid, `Something went wrong with processing Queue Entry. Failed to produce Ownable ` + JSON.stringify(queryProcessingEntry[0]));
				await this.queueService.ownableFailed(ltoNetworkId, queryProcessingEntry[0].rid, "More than 300 seconds inactive in Processing Queue");
			}
		}
		// TODO: Delete following lines
		// const queryFailedEntry: QueueEntry[] = this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Failed);
		// if (Array.isArray(queryFailedEntry) && queryFailedEntry.length > 0) {
		// 	const firstEntry = queryFailedEntry[0];
		// 	if (firstEntry.rid && firstEntry.rid !== '') {
		// 		this.loggingService.log(firstEntry.rid, `First Entry: ` + JSON.stringify(firstEntry));
		// 		await this.queueService.moveBackFailedEntries();
		// 	}

		// }

	}
	private async checkQueueStatus() {
		this.checkForFailedEntries('L');
		this.checkForFailedEntries('T');

		const isEmpty = this.queueService.isQueueEmpty();
		if (!isEmpty) {
			// console.log("Checking Queue Status: queue not empty...");
			try {
				const relayURL = this.getRelayUrl();
				const isUp: boolean = await this.isRelayUp(relayURL);
				if (isUp) {

					if (!this.queueService.isCreatingOwnable()) {
						// console.log("Waiting 10 seconds for a possible TX ID that needs to be populated into LTO node network...");
						await this.wait(10000);
						let ltoNetworkId, requestId, data, sender, reenqueued_NFTURI, reenqueued_NFTINFO, reenqueued = false;
						try {
							[ltoNetworkId, requestId, data, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO] = await this.queueService.processNextQueueEntry();
						} catch (err) {
							this.loggingService.logError(requestId, `processNextQueueEntry failed on lto network ${ltoNetworkId}: ${err}`);
						}

						if (requestId != null && data != null) {
							try {
								await this.store(ltoNetworkId, requestId, data, 1, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO);
							} catch (err) {
								const queryProcessingEntry1: QueueEntry[] = this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
								this.loggingService.log(queryProcessingEntry1[0].rid, `Ownable creation failed on lto network ${ltoNetworkId}: ${err}`);
								try {
									await this.queueService.ownableFailed(ltoNetworkId, queryProcessingEntry1[0].rid, `${err}`);
								} catch (e) {
									this.loggingService.log(queryProcessingEntry1[0].rid, `Setting Ownable Failed failed on lto network ${ltoNetworkId}: ${e}`);
									throw (e);
								}
								throw err;
							}
						}
					}
				}
				else {
					// this.loggingService.log(Missing RID , `Error: oRelay Server ${relayURL} is down`); 
					throw new Error(`Error: oRelay Server ${relayURL} is down`);
				}
			} catch (err) {
				throw err;
			}
		}

		const queueingAllowed_L = this.config.get('eqty.queue.mainnet');
		const queueingAllowed_T = this.config.get('eqty.queue.testnet');
		this.queueService.allowQueueing('L', queueingAllowed_L);
		this.queueService.allowQueueing('T', queueingAllowed_T);
	}

	public getInQueueEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
		return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.InQueue);
	}
	public getProcessingEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
		return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
	}
	public getReadyEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
		return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Ready);
	}
	public getSentEntries(ltoNetworkId: 'L' | 'T'): QueueEntry[] {
		return this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Sent);
	}
	public getQueueEntriesByRequestId(ltoNetworkId: 'L' | 'T', requestId: string): [QueueEntry, number] {
		return this.queueService.getQueueEntryByRequestId(ltoNetworkId, requestId);
	}
	/**
	 * Get queue entries by wallet address
	 * LTO network no longer exists - uses Ethereum address validation
	 */
	public getQueueEntriesByWallet(wallet: string): QueueEntry[] {
		// LTO addresses no longer exist, check for valid Ethereum address
		if (!this.eqtyService.isValidAddress(wallet)) {
			return [];
		}
		// Use config-based network detection
		const networkId = this.getNetworkType() === 'mainnet' ? 'L' : 'T';
		return this.queueService.getQueueEntriesByWallet(networkId as 'L' | 'T', wallet);
	}
	public getQueueEntriesByStatus(ltoNetworkId: 'L' | 'T', status: OwnableStatus): QueueEntry[] {
		return this.queueService.getQueueEntriesByStatus(ltoNetworkId, status);
	}

	public queueStatus(): any {
		let isOwnableBeingBuild: string = '';
		let isQueueingAllowed: boolean = true;
		let currentlyProcessedQueueEntry: QueueEntry[] = [];

		const defaultQueueEntry = {
			data: '',
			rid: '',
			ltoWallet: '',
			ltoNetworkId: null,
			hash: '',
			txId: '',
			ownableStatus: OwnableStatus.Unknown,
			templateId: 0,
			timestampInQueue: 0,
			timestampReady: 0,
			timestampProcessing: 0,
			timestampSent: 0,
			timestampFailed: 0,
			failedErrMsg: '',
			cid: '',
			reenqueued: false,
			reenqueued_NFTURI: '',
			nftInfo: {
				network: '',
				address: '',
				id: 0
			}
		};
		const networkId = this.queueService.isCreatingOwnable();
		if (networkId === 'L' || networkId === 'T') {
			isOwnableBeingBuild = networkId;
			isQueueingAllowed = this.queueService.isQueueingAllowed(networkId);
			currentlyProcessedQueueEntry = this.queueService.getQueueEntriesByStatus(networkId, OwnableStatus.Processing);
		} else {
			currentlyProcessedQueueEntry.push(defaultQueueEntry);
		}
		// const timeElapsed = this.queueBusyTimer * 10; // queueBusytimer is increased each 10 seconds by one

		return {
			creatingOwnable: isOwnableBeingBuild,
			isQueueingAllowed: isQueueingAllowed,
			requestId: currentlyProcessedQueueEntry[0].rid.toString(),
			ltoWallet: currentlyProcessedQueueEntry[0].ltoWallet.toString(),
			hash: currentlyProcessedQueueEntry[0].hash.toString(),
			txId: currentlyProcessedQueueEntry[0].txId.toString(),
			ownableStatus: currentlyProcessedQueueEntry[0].ownableStatus,
			templateId: currentlyProcessedQueueEntry[0].templateId.toString(),
			timestampInQueue: currentlyProcessedQueueEntry[0].timestampInQueue.toString(),
			timestampProcessing: currentlyProcessedQueueEntry[0].timestampProcessing.toString(),
			timestampSent: currentlyProcessedQueueEntry[0].timestampSent.toString(),
			timestampFailed: currentlyProcessedQueueEntry[0].timestampFailed.toString()

		};
	}

	private isValidPackageName(name: string): boolean {
		// Delegated to OwnableValidationService
		return this.validation.isValidPackageName(name);
	}
	private sanitizePackageName(name: string, hasdotWebp: boolean): string {
		// Delegated to OwnableValidationService
		return this.validation.sanitizePackageName(name, hasdotWebp);
	}
	private wait = (n: number) => new Promise((resolve) => setTimeout(resolve, n));


	public async store(ltoNetworkId: 'L' | 'T', requestId: string, data: Uint8Array, templateId: number, sender: string, reenqueued: boolean, reenqueued_NFTURI: string, reenqueued_NFTINFO: NftInfo) {
		try {
			this.loggingService.log(requestId, `Unzipping user input files for Ownable creation into memory`);
			const requestIdFiles = await this.unzip(data);

			if (!requestIdFiles.has('ownableData.json')) {
				this.loggingService.logError(requestId, `Invalid package: 'ownableData.json' is missing in requestId: ${requestId}`);
				throw new Error("Invalid package: 'ownableData.json' is missing");
			}

			const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
			this.loggingService.log(requestId, `jsonFile: ${JSON.stringify(jsonFile)}`);

			if (this.isValidPackageName(jsonFile.PLACEHOLDER1_NAME)) {
				this.loggingService.log(requestId, `Valid package PLACEHOLDER1_NAME. ${jsonFile.PLACEHOLDER1_NAME}`);
			} else {
				this.loggingService.log(requestId, `Sanatizing invalid characters in PLACEHOLDER1_NAME: ${jsonFile.PLACEHOLDER1_NAME}`);
				const sanatized_PLACEHOLDER1_NAME = this.sanitizePackageName(jsonFile.PLACEHOLDER1_NAME, false);
				const sanatized_PLACEHOLDER2_IMG = this.sanitizePackageName(jsonFile.PLACEHOLDER2_IMG, true);
				this.loggingService.log(requestId, `Updating the image file name in the Ownable request from: ${jsonFile.PLACEHOLDER2_IMG} to ${sanatized_PLACEHOLDER2_IMG}`);

				if (requestIdFiles.has(jsonFile.PLACEHOLDER2_IMG)) {
					const bufferValue = requestIdFiles.get(jsonFile.PLACEHOLDER2_IMG);  // Get the Buffer associated with the old key
					if (jsonFile.PLACEHOLDER2_IMG !== sanatized_PLACEHOLDER2_IMG) {      // Check if the old key is different from the new key
						requestIdFiles.set(sanatized_PLACEHOLDER2_IMG, bufferValue);         // Set the Buffer to the new key
						requestIdFiles.delete(jsonFile.PLACEHOLDER2_IMG);                   // Delete the old key
					}
				}
				this.loggingService.log(requestId, `OLD: ${jsonFile.PLACEHOLDER1_NAME}  NEW: ${sanatized_PLACEHOLDER1_NAME}`);
				this.loggingService.log(requestId, `OLD: ${jsonFile.PLACEHOLDER2_IMG}  NEW: ${sanatized_PLACEHOLDER2_IMG}`);
				jsonFile.PLACEHOLDER1_NAME = sanatized_PLACEHOLDER1_NAME;
				jsonFile.PLACEHOLDER2_IMG = sanatized_PLACEHOLDER2_IMG;
			}
			// if (this.isValidPackageName(jsonFile.PLACEHOLDER1_DESCRIPTION)) {
			//   if (verbose) console.log("Valid package PLACEHOLDER1_DESCRIPTION.");
			// } else {
			//   if (verbose) console.log(`Sanatizing invalid characters in PLACEHOLDER1_DESCRIPTION: ${jsonFile.PLACEHOLDER1_DESCRIPTION}`);
			//   jsonFile.PLACEHOLDER1_DESCRIPTION = this.sanitizePackageName(jsonFile.PLACEHOLDER1_DESCRIPTION);

			// }
			// if (this.isValidPackageName(jsonFile.PLACEHOLDER2_TITLE)) {
			//   if (verbose) console.log("Valid package PLACEHOLDER2_TITLE.");
			// } else {
			//   if (verbose) console.log(`Sanatizing invalid characters in PLACEHOLDER2_TITLE: ${jsonFile.PLACEHOLDER2_TITLE}`);
			//   jsonFile.PLACEHOLDER2_TITLE = this.sanitizePackageName(jsonFile.PLACEHOLDER2_TITLE);
			// }
			this.loggingService.log(requestId, `ownableData.json:` + JSON.stringify(jsonFile));

			if (jsonFile.CREATE_NFT === 'true') {
				// if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum') && !(jsonFile.NFT_BLOCKCHAIN === 'ethereum')) {
				if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum')) {
					this.loggingService.logError(requestId, `Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
					throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
				}
			} else {
				jsonFile.NFT_BLOCKCHAIN = 'noNFT';
			}
			this.loggingService.log(requestId, `checking LTO transaction ID: ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}`);

			const transactionIdData: TransactionIdData = await this.checkLtoTransactionId(ltoNetworkId, jsonFile.OWNABLE_LTO_TRANSACTION_ID, templateId, jsonFile.NFT_BLOCKCHAIN, requestId, reenqueued);
			this.loggingService.log(requestId, `transactionIdData: ` + JSON.stringify(transactionIdData));

			// await this.storeFiles(`${this.pathToRids}/${requestId}`, requestId, requestIdFiles);

			// Before creating the Ownable a new NFT is minted with NFT id and the user NFT input data is checked

			this.loggingService.log(requestId, `jsonFile: ` + JSON.stringify(jsonFile));
			let nftInfo: NftInfo;

			if (jsonFile.CREATE_NFT === 'true') {

				// const picture: Buffer = readFileSync(`${this.pathToRids}/${requestId}/${requestId}/${jsonFile.PLACEHOLDER2_IMG}`);
				const picture: Buffer = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
				this.loggingService.log(requestId, `Creating S3 image File for NFT Token URI ...`);
				try {
					if (!reenqueued || reenqueued_NFTURI === '') {
						jsonFile.NFT_TOKEN_URI = await this.createPinataPinnedFile(picture, jsonFile.PLACEHOLDER1_NAME, jsonFile.PLACEHOLDER1_DESCRIPTION);

					} else {
						jsonFile.NFT_TOKEN_URI = reenqueued_NFTURI;
					}
					// jsonFile.NFT_TOKEN_URI = await this.s3.uploadPictureToS3(picture);
				} catch (err) {
					this.loggingService.logError(requestId, `Creating S3 image File failed: ${err}`);
					throw (err);
				}
				this.loggingService.log(requestId, `NFT Token URI: ${jsonFile.NFT_TOKEN_URI}`);
				try {
					if (!reenqueued) {
						nftInfo = await this.mintNewNft(ltoNetworkId, jsonFile, requestId);
					} else {
						nftInfo = reenqueued_NFTINFO;
					}
				} catch (err) {
					this.loggingService.logError(requestId, `Minting NFT failed: ${err}`);
					throw (err);
				}

				jsonFile.PLACEHOLDER1_KEYWORDS.push("hasNFT");
			} else {
				nftInfo = {
					network: "",
					address: "",
					id: 0, // 1, 2, 3      
				}
				jsonFile.PLACEHOLDER1_KEYWORDS.push("noNFT");
			}

			try {
				this.loggingService.log(requestId, `creating template with request ID ${requestId} and modifying requestIdFiles...`);
				await this.startOwnableCreation(ltoNetworkId, requestId, jsonFile, nftInfo, sender, requestIdFiles);
			} catch (err) {
				this.loggingService.logError(requestId, `start Ownable Creation failed ${err}`);
				throw err;
			}
		} catch (err) {
			throw (err);
		}
	}
	private async executeCommand(command: string, requestId: string) {
		return new Promise((resolve, reject) => {
			const child = exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
				if (error) {
					this.loggingService.logError(requestId, `Error executing command: ${stderr}`);
					return reject(error);
				}
				// console.log(stdout);
				resolve(stdout ? stdout : stderr);
			});

			// Listen for process exit
			child.on('exit', (code) => {
				this.loggingService.log(requestId, `Child process exited with code ${code}`);
			});

			// Optional: listen for any uncaught exceptions
			child.on('error', (err) => {
				this.loggingService.logError(requestId, `Failed to start subprocess: ${err}`);
				reject(err);
			});
		});
	}
	private async executeCommand1(ltoNetworkId: 'L' | 'T', command: string, requestId: string) {
		return new Promise((resolve, reject) => {
			const child = exec(command, { env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } }, (error, stdout, stderr) => {
				if (error) {
					this.loggingService.logError(requestId, `Error executing command on LTO network ${ltoNetworkId}: ${stderr}`);
					this.queueService.ownableFailed(ltoNetworkId, requestId, `Error executing command ${stderr} with error: ${error}`);
					return reject(error);
				}
				// console.log(stdout);
				resolve(stdout ? stdout : stderr);
			});

			// Listen for process exit
			child.on('exit', (code) => {
				this.loggingService.log(requestId, `Child process exited with code ${code} on LTO network ${ltoNetworkId}`);
			});

			// Optional: listen for any uncaught exceptions
			child.on('error', (err) => {
				this.loggingService.logError(requestId, `Failed to start subprocess on LTO network ${ltoNetworkId}: ${err}`);
				reject(err);
			});
		});
	}


	private async replaceLineInFile(file: string, key: string, value: string) {
		let data: any;
		try {
			data = readFileSync(file, 'utf8');
		} catch (err) {
			throw new Error(`Read File Sync failed for file ${file}. Error: ${err}`);
		}

		var formatted = data.replace(key, value);
		try {
			writeFileSync(file, formatted, 'utf8');
		} catch (err) {
			throw new Error(`Write File Sync failed for file ${file}. Error: ${err}`);
		}
	}

	private async watchFileCreation(ltoNetworkId: 'L' | 'T', zipFile1: string, jsonFile: any, nftInfo: NftInfo, sender: string, rid: string) {
		this.loggingService.log(rid, `Ownable creation startet. Waiting for Zip File ${zipFile1} to be created...`);

		let timeout = 0;
		while (!fileExists(zipFile1)) {
			this.wait(1000);
			timeout += 1;
			if (timeout >= 300) {
				break;
			}
		}
		this.loggingService.log(rid, `Zip File ${zipFile1} Created successfully.`);
		this.loggingService.log(rid, `Unzipping to produce unique cid...`);
		let pkgFiles: any;
		try {
			pkgFiles = await this.unzip(zipFile1);
		} catch (err) {
			this.loggingService.logError(rid, `Unzipping ${zipFile1} failed`);
			throw err;
		}

		// adding a timestamp file to the Ownable to guarantee uniqueness for the CID
		const timeMillisecondsNow = Date.now().toString();
		pkgFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));
		this.loggingService.log(rid, `Added unique timestamp.txt ${timeMillisecondsNow} for creating a unique package CID`);

		this.loggingService.log(rid, `getting unique chain ID from created ownable zip files ...`);
		let cid: any;
		try {
			cid = await this.getUniqueId(pkgFiles);
		} catch (err) {
			this.loggingService.logError(rid, `getting unique CID failed`);
			throw err;
		}

		this.loggingService.log(rid, `setCidNftInfo rid ${rid}`);
		this.loggingService.log(rid, `setCidNftInfo cid ${cid}`);
		this.loggingService.log(rid, `setCidNftInfo nftInfo` + JSON.stringify(nftInfo));
		this.loggingService.log(rid, `setCidNftInfo nft TOken URI ${jsonFile.NFT_TOKEN_URI}`);
		try {
			await this.queueService.setCidNftInfo(ltoNetworkId, rid, cid, nftInfo, jsonFile.NFT_TOKEN_URI);
		} catch (err) {
			this.loggingService.logError(rid, `setting Cid Nft Info failed`);
			throw err;
		}

		const ownableZip = `${this.pathToCids}/${cid}/${cid}.zip`;
		this.loggingService.log(rid, `Storing new Ownable zip file and deleting the source Ownable zip ...`);
		try {
			cpSync(zipFile1, ownableZip);
		} catch (err) {
			this.loggingService.logError(rid, `Error cpSync ${zipFile1}. Error: ${err}`);
			throw err;
		}

		try {
			rmSync(zipFile1);
		} catch (err) {
			this.loggingService.logError(rid, `Error rmSync ${zipFile1}. Error: ${err}`);
			throw err;
		}
		try {
			rmSync(`ownables/${jsonFile.PLACEHOLDER1_NAME}`, { recursive: true });
		} catch (err) {
			this.loggingService.logError(rid, `Error rmSync ownables/${jsonFile.PLACEHOLDER1_NAME}. Error: ${err}`);
			throw err;
		}

		const pkgOwnable: TypedPackage = {
			isDynamic: true,
			hasMetadata: false,
			hasWidgetState: false,
			isConsumable: false,
			isConsumer: false,
			isTransferable: true,
			title: jsonFile.PLACEHOLDER2_TITLE.toString(),
			name: jsonFile.PLACEHOLDER1_NAME.toString(),
			description: jsonFile.PLACEHOLDER1_DESCRIPTION.toString(),
			cid: `${cid}`,
			versions: [jsonFile.PLACEHOLDER1_VERSION.toString()],
			keywords: jsonFile.PLACEHOLDER1_KEYWORDS
		};
		this.loggingService.log(rid, `Creating the EventChain for the new Ownable. Pkg:` + JSON.stringify(pkgOwnable));


		let chainBuffer: Buffer;
		try {
			chainBuffer = await this.createEventChain(pkgOwnable, nftInfo, sender); // sender from TX ID is new ownable owner
		} catch (err) {
			this.loggingService.logError(rid, `Create Event Chain failed ${nftInfo} ${sender} Error: ${err}`);
			throw err;
		}

		pkgFiles.set('chain.json', chainBuffer);

		try {
			await this.storeFiles(`${this.pathToCids}/${cid}`, cid, pkgFiles);
		} catch (err) {
			this.loggingService.logError(rid, `Storing files failed ${this.pathToCids}/${cid} Error: ${err}`);
			throw err;
		}

		var new_zip = new JSZip();

		let zipFile: Buffer;
		try {

			zipFile = readFileSync(`${this.pathToCids}/${cid}/${cid}.zip`);
		} catch (err) {
			this.loggingService.logError(rid, `Reading File failed ${this.pathToCids}/${cid}/${cid}.zip Error: ${err}`);
			throw err;
		}
		try {
			await new_zip.loadAsync(zipFile);
		} catch (err) {
			this.loggingService.logError(rid, `Loading async File failed. Error: ${err}`);
			throw err;
		}
		let eventChainJsonFile: Buffer;
		try {
			eventChainJsonFile = readFileSync(`${this.pathToCids}/${cid}/${cid}.json`);
		} catch (err) {
			this.loggingService.logError(rid, `Reading File failed ${this.pathToCids}/${cid}/${cid}.json Error: ${err}`);
			throw err;
		}
		this.loggingService.log(rid, `Adding chain.json to new zip ${JSON.stringify(eventChainJsonFile)}`);
		new_zip.file('chain.json', eventChainJsonFile);
		this.loggingService.log(rid, `Unique timestamp file to new zip`);
		new_zip.file('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

		let zipContent: Uint8Array;
		try {
			zipContent = await new_zip.generateAsync({ type: "uint8array" });
		} catch (err) {
			this.loggingService.logError(rid, `Failed to generate Async new zip Content: ${err}`);
			throw err;
		}
		try {
			await this.queueService.setQueueEntryStatus(ltoNetworkId, rid, OwnableStatus.Ready);
			this.loggingService.log(rid, `Setting Queue entry status to Ready for ${rid}`);
		} catch (err) {
			this.loggingService.logError(rid, `Failed to set Queue Entry status to Ready: ${err}`);
			throw err;
		}
		// Store Package zip including new anchored eventChain to s3Bucket
		try {
			await this.s3.storeZip(ltoNetworkId, cid, rid, sender, zipContent);
			this.loggingService.log(rid, `Stored successfully ${cid}_${rid}_${sender}_.zip on s3 Bucket`);
		} catch (err) {
			this.loggingService.logError(rid, `Failed to store ${cid}_${rid}_${sender}_.zip on s3 Bucket: ${err}`);
			throw err;
		}

		try {
			this.loggingService.log(rid, `Sending Ownable.. ltoNetworkId:${ltoNetworkId} rid:${rid} sender:${sender}`);
			await this.sendOwnable(ltoNetworkId, rid, sender, zipContent);
		} catch (err) {
			this.loggingService.logError(rid, `Failed to send Ownable RID:${rid} SENDER:${sender}: ${err}`);
			throw err;
		}
		// try {
		// 	this.loggingService.log(rid, `rm -rf ${this.pathToCids}/${cid}`);
		// 	const output = await this.executeCommand(`rm -rf ${this.pathToCids}/${cid}`, rid);
		// 	this.loggingService.log(rid, `${output}`);
		// } catch (error) {
		// 	this.loggingService.logError(rid, `rm -rf ${this.pathToCids}/${cid} failed: ${error}`);
		// 	throw error;
		// }
		// this.addCidToJsonArray(cid);

	}

	public async resendOwnableByRequestId(ltoNetworkId: 'L' | 'T', requestId: string): Promise<any> {
		let files: string[];
		if (ltoNetworkId === 'L') {
			files = await this.s3.s3BucketOwnables_L.list();
		} else {
			files = await this.s3.s3BucketOwnables_T.list();
		}
		this.logger.debug(`Bucket files: ${files}`);

		// Build the regex pattern
		const myReg = new RegExp(`^${requestId}_`, 'g');
		this.logger.debug(`Regex pattern: ${myReg}`);
		const matchingFile = files.find((file) => file.match(myReg));


		const retVal = {
			ltoNetworkId: ltoNetworkId,
			requestId: requestId,
			cid: "",
			sender: "",
			resend: false
		};

		if (matchingFile) {
			const filesArray = matchingFile.split('_');
			this.logger.debug(`Matching file array: ${filesArray}`);

			retVal.cid = filesArray[1]; // cid
			retVal.sender = filesArray[2];
			let zipContent: Buffer;

			if (ltoNetworkId === 'L') {
				zipContent = await this.s3.s3BucketOwnables_L.get(`${requestId}_${retVal.cid}_${retVal.sender}_.zip`);
			} else {
				zipContent = await this.s3.s3BucketOwnables_T.get(`${requestId}_${retVal.cid}_${retVal.sender}_.zip`);
			}

			try {
				await this.sendOwnable(ltoNetworkId, requestId, retVal.sender, zipContent);
				retVal.resend = true;
			} catch (err) {
				retVal.resend = false;
				this.loggingService.logError(requestId, `Failed to re-send Ownable RID:${requestId} SENDER:${retVal.sender}: ${err}`);
				throw err;
			}

			return JSON.parse(JSON.stringify(retVal));

		}
	}

	// private addCidToJsonArray(cid: string) {
	// 	this.jsonArrayOwnables.push(cid);
	// 	let jsonFormattedArray = JSON.stringify(this.jsonArrayOwnables, null, 2);
	// 	console.log("jsonFormattedArray", jsonFormattedArray);
	// }
	private async startOwnableCreation(ltoNetworkId: 'L' | 'T', rid: string, jsonFile: any, nftInfo: NftInfo, sender: string, requestIdFiles: Map<string, Buffer>) {
		this.loggingService.log(rid, `Starting Ownable creation...`);
		this.loggingService.log(rid, `Copying template 1 to template directory for modification`);
		let cpCmdFrom = `${this.pathToTemplates}/template1`

		let cpCmdTo = `ownables/${jsonFile.PLACEHOLDER1_NAME}`;
		try {
			cpSync(cpCmdFrom, cpCmdTo, { "recursive": true });
			this.loggingService.log(rid, `Success: copy template from ${cpCmdFrom} to ${cpCmdTo}`);
		} catch (err) {
			this.loggingService.logError(rid, `Failed to copy template from ${cpCmdFrom} to ${cpCmdTo}`);
			throw (err);
		}
		this.loggingService.log(rid, `Request ID: ${rid}`);
		this.loggingService.log(rid, `PLACEHOLDER2_IMG: ${jsonFile.PLACEHOLDER2_IMG}`);
		this.loggingService.log(rid, `OWNABLE_THUMBNAIL: ${jsonFile.OWNABLE_THUMBNAIL}`);

		this.loggingService.log(rid, `copying image file into template`);
		const image = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
		let writeCommand = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`;
		try {
			writeFileSync(writeCommand, image);
		}
		catch (err) {
			this.loggingService.logError(rid, `Write command failed ${writeCommand} for image ${image}`);
			throw (err);
		}

		this.loggingService.log(rid, `copying thumbnail image file into template`);
		const thumbnail = requestIdFiles.get(`${jsonFile.OWNABLE_THUMBNAIL}`);
		writeCommand = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`;
		try {
			writeFileSync(writeCommand, thumbnail);
		}
		catch (err) {
			this.loggingService.logError(rid, `Write command failed ${writeCommand} for thumbnail ${thumbnail}`);
			throw (err);
		}

		this.loggingService.log(rid, `Replacing Placeholder texts of template with user input data`);
		try {
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_NAME".toString(), `"${jsonFile.PLACEHOLDER1_NAME}"`.toString());
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_DESCRIPTION".toString(), `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`.toString());
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_VERSION".toString(), `"${jsonFile.PLACEHOLDER1_VERSION}"`.toString());
			if (typeof jsonFile.PLACEHOLDER1_AUTHORS === 'undefined')
				jsonFile.PLACEHOLDER1_AUTHORS = '';
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_AUTHORS".toString(), `"${jsonFile.PLACEHOLDER1_AUTHORS}"`.toString());

			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`.toString(), "PLACEHOLDER1_KEYWORDS".toString(), arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS));

			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(), "PLACEHOLDER2_TITLE".toString(), `${jsonFile.PLACEHOLDER2_TITLE}`);
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`.toString(), "PLACEHOLDER2_IMG".toString(), `"${jsonFile.PLACEHOLDER2_IMG}"`.toString());

			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(), "PLACEHOLDER3_MSG".toString(), `${jsonFile.PLACEHOLDER1_NAME}`);
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`.toString(), "PLACEHOLDER3_STATE".toString(), `${jsonFile.PLACEHOLDER1_NAME}`);

			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_CONTRACT_NAME".toString(), `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`.toString());
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_TYPE".toString(), `"${jsonFile.PLACEHOLDER4_TYPE}"`.toString());
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_DESCRIPTION".toString(), `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`.toString());
			await this.replaceLineInFile(`ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`.toString(), "PLACEHOLDER4_NAME".toString(), `"${jsonFile.PLACEHOLDER4_NAME}"`.toString());
		} catch (err) {
			this.loggingService.logError(rid, `Replacing Placeholder texts failed ${err}`);
			throw (err);
		}

		this.loggingService.log(rid, `Checking Cargo, Wasm-Pack and Rustup existance...`);
		try {
			const output = await this.executeCommand('cargo --version', rid);
			this.loggingService.log(rid, `${output}`);
		} catch (err) {
			this.loggingService.logError(rid, `Cargo command failed, but essential for Ownable creation: ${err}`);
			throw err;
		}
		try {
			const output = await this.executeCommand('rustup --version', rid);
			this.loggingService.log(rid, `${output}`);
		} catch (err) {
			this.loggingService.logError(rid, `Rustup command failed, but essential for Ownable creation: ${err}`);
			throw err;
		}
		try {
			const output = await this.executeCommand('wasm-pack --version', rid);
			this.loggingService.log(rid, `${output}`);
		} catch (err) {
			this.loggingService.logError(rid, `Wasm-Pack command failed, but essential for Ownable creation: ${err}`);
			throw err;
		}

		try {
			this.loggingService.log(rid, `Building Ownable...`);
			const output = await this.executeCommand1(ltoNetworkId, `npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`, rid);
			this.loggingService.log(rid, `${output}`);
		} catch (err) {
			this.loggingService.logError(rid, `Command: npm run ownables command failed: ${err}`);
			try {
				const output = await this.executeCommand(`rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME}`, rid);
				this.loggingService.log(rid, `${output}`);
			} catch (error) {
				this.loggingService.logError(rid, `Command: rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME} failed: ${error}`);
				throw error;
			}
		}

		const zipFileToWatch = `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`;
		try {
			this.loggingService.log(rid, `Starting file watcher for zip file: ${zipFileToWatch}`);
			await this.watchFileCreation(ltoNetworkId, `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`, jsonFile, nftInfo, sender, rid);
		} catch (err) {
			this.loggingService.logError(rid, `Failed to watch File creation for ${zipFileToWatch}. ${err}`);
			throw err;
		}
	}

	private async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
		// Delegated to OwnableStorageService
		return this.storage.unzip(data);
	}

	private async getUniqueId(files: Map<string, Buffer>): Promise<string> {
		const source = Array.from(files.entries()).map(([filename, content]) => ({
			path: `./${filename}`,
			content,
		}));

		for await (const entry of this.ipfs.addAll(source, { onlyHash: true, cidVersion: 1 })) {
			//if (entry.path === entry.cid.toString() && !!entry.mode) return entry.cid.toString();
			if (entry.path === entry.cid.toString()) {
				return entry.cid.toString();
			}
		}
		throw new Error('Failed to calculate directory CID: importer did not find a directory entry in the input files');
	}

	private async storeZip(destPath: string, uniqueId: string, data: Uint8Array): Promise<void> {
		const file = path.join(destPath, `${uniqueId}.zip`);
		writeFileSync(file, data);
	}


	private async storeFiles(destPath: string, cid: string, files: Map<string, Buffer>): Promise<void> {
		const packageDir = path.join(destPath, cid);
		mkdirSync(packageDir, { recursive: true });

		await Promise.all(
			Array.from(files.entries()).map(([filename, content]) => writeFileSync(path.join(packageDir, filename), content)),
		);
	}

}
