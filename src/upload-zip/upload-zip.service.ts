import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventChainService } from '../event-chain/event-chain.service';
import { FileManagementService } from '../file-management/file-management.service';
import { PinataService } from '../pinata/pinata.service';
import arrayToString from '../utils/arrayToString';
import JSZip from 'jszip';

import { Account, LTO, Event, EventChain, Message, Relay, getNetwork } from "@ltonetwork/lto";

// import chokidar from 'chokidar';
import { NftInfo, OwnableInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { TypedPackage } from "../interfaces/TypedPackage";
import { IPFS } from '../interfaces/ipfs.interface';
// import { Blob } from 'buffer';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { PinataSDK } from "pinata";
import { Request, Response } from 'express';
import { sign, verify } from '@ltonetwork/http-message-signatures';
import * as fs from 'fs';
import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';
import { NFTService } from '../nft/nft.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { UserError } from '../interfaces/error';
import { QueueService } from '../queue/queue.service';
import { LoggingService } from '../logging/logging.service';
import { LtoService } from '../lto/lto.service';
import { S3Service } from '../s3/s3.service';
import { CoinmarketcapService } from '../coinmarketcap/coinmarketcap.service';

import { packageInfo } from '../utils/package-info';
import { RelayService } from '../relay/relay.service';
import * as path from 'path';

@Injectable()
export class UploadZipService implements OnModuleInit, OnModuleDestroy {
	// private pathToRids: string;
	private pathToCids: string;
	private pathToTemplates: string;
	private packageInfo: any;
	private intervalId: NodeJS.Timeout;
	private nodeVersion = process.version;
	private pinata: PinataSDK;

	constructor(
		private readonly eventChainService: EventChainService,
		private readonly relayService: RelayService,
		private readonly fileManagement: FileManagementService,
		private readonly pinataService: PinataService,
		private readonly httpService: HttpService,
		private readonly config: ConfigService,
		private readonly ltoService: LtoService,
		private readonly nft: NFTService,
		private readonly queueService: QueueService,
		private readonly s3: S3Service,
		private readonly coinmarketcap: CoinmarketcapService,
		private readonly loggingService: LoggingService,
		private readonly telegramService: TelegramBotService,
		@Inject('IPFS') private readonly ipfs: IPFS,
	) {

	}

	async onModuleInit() {
		await this.config.load();

		this.pinata = new PinataSDK({
			pinataJwt: this.config.get('pinata.jwt'), // process.env.PINATA_JWT!,
			pinataGateway: this.config.get('pinata.gateway') // "example-gateway.mypinata.cloud",
		});

		this.packageInfo = packageInfo;

		this.pathToCids = this.packageInfo.ownableCidPath;
		this.pathToTemplates = this.packageInfo.ownableTemplatesPath;

		await this.fileManagement.ensureDirectoryExists(this.pathToCids);
		this.intervalId = setInterval(async () => {
			try {
				await this.checkQueueStatus();
			}
			catch (err) {
				console.log(`ERROR QUEUE STATUS: ${err}`);
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
			console.log(`Balance is low: ${numericBalance}`);
			await this.telegramService.sendMessageToTelegramBot(ltoNetworkId, `\n${networkName}: Balance is low: ${numericBalance}`);
		}


		return balance;
	}
	public getLTOAccountAddress(ltoNetworkId: 'L' | 'T'): string {
		return this.ltoService.getLTOAccountAddress(ltoNetworkId);
	}
	public isEVMAddress(address: string): boolean {
		return this.nft.isEVMAddress(address);
	}
	public isValidLtoAddress(address: string): string {
		const isValidMainnet = this.ltoService.ltoMainnet.isValidAddress(address);
		const isValidTestnet = this.ltoService.ltoTestnet.isValidAddress(address);
		if (isValidMainnet) return "L";
		if (isValidTestnet) return "T";
		return "false";
	}
	public async getLTOAccountBalance(ltoNetworkId: 'L' | 'T') {
		const address = this.getLTOAccountAddress(ltoNetworkId);
		let url: string;
		if (ltoNetworkId === 'L') {
			url = `${this.config.get('lto.node.mainnet')}/addresses/balance/${address}`;
		} else {
			url = `${this.config.get('lto.node.testnet')}/addresses/balance/${address}`;

		}

		const data = await this.httpService.axiosRef
			.get(url)
			.then((res) => res.data)
			.catch((err) => {
				throw new Error(
					err?.message + ': ' + JSON.stringify(err?.response?.data),
				);
			});

		return data;
	}
	/**
 * Broadcasts a pre-signed transaction to the LTO Network
 * @param ltoNetworkId Network identifier ('L' for mainnet, 'T' for testnet)
 * @param signedTransaction The pre-signed transaction object ready to broadcast
 * @param requestId Optional request ID for logging
 * @returns The response from the network node
 */
public async broadcastTransaction(
	ltoNetworkId: 'L' | 'T', 
	signedTransaction: any, 
	requestId?: string
  ): Promise<any> {
	const rid = requestId || `broadcast-${Date.now()}`;
	
	try {
	  // Determine which LTO instance to use based on network ID
	  const lto = ltoNetworkId === 'L' ? this.ltoService.ltoMainnet : this.ltoService.ltoTestnet;
	  
	  this.loggingService.log(rid, `Broadcasting transaction to ${ltoNetworkId} network`);
	  
	  // Serialize the transaction object if not already a string
	  const serializedTx = typeof signedTransaction === 'string' 
		? signedTransaction 
		: JSON.stringify(signedTransaction);
	  
	  // Broadcast the transaction
	  const response = await fetch(`${lto.nodeAddress}/transactions/broadcast`, {
		method: 'POST',
		headers: {
		  'Content-Type': 'application/json'
		},
		body: serializedTx
	  });
	  
	  if (!response.ok) {
		const errorText = await response.text();
		this.loggingService.logError(rid, `Failed to broadcast transaction: ${errorText}`);
		throw new Error(`Failed to broadcast transaction: ${errorText}`);
	  }
	  
	  const result = await response.json();
	  this.loggingService.log(rid, `Transaction successfully broadcast with ID: ${result.id}`);
	  
	  return result;
	} catch (err) {
	  this.loggingService.logError(rid, `Broadcasting transaction failed: ${err}`);
	  throw err;
	}
  }
	// Add this property to store signed transactions
	private signedTransactions: Map<string, {
		ltoNetworkId: 'L' | 'T',
		transaction: any
	}> = new Map();

	/**
	 * Stores a signed transaction for later broadcasting
	 * @param requestId Request ID to associate the transaction with
	 * @param ltoNetworkId Network identifier ('L' for mainnet, 'T' for testnet)
	 * @param signedTransaction The signed transaction data
	 */
	public async storeSignedTransaction(
		requestId: string,
		ltoNetworkId: 'L' | 'T',
		signedTransaction: any
	): Promise<void> {
		this.loggingService.log(requestId, `Storing signed transaction for request ID: ${requestId}`);
		this.signedTransactions.set(requestId, { ltoNetworkId, transaction: signedTransaction });
	}

	public getLogsByRequestId(requestId: string): { rid: string, level: string, message: string, timestamp: Date }[] {
		return this.loggingService.getLogsByRid(requestId);
		
	}
	
	public async isRelayServerUp(): Promise<string> {
		return this.relayService.isRelayServerUp();
	}
	
	public async sendOwnable(ltoNetworkId: 'L' | 'T', rid: string, recipient: string, content?: Uint8Array) {
		return this.relayService.sendOwnable(ltoNetworkId, rid, recipient, content);
	}

	
	private async checkLtoTransactionId(ltoNetworkId: 'L' | 'T', ltoTransactionId: string, templateId: number, chain: string, requestId: string, reenqueued: boolean): Promise<TransactionIdData> {
		return this.ltoService.checkLtoTransactionId(ltoNetworkId, ltoTransactionId, templateId, chain, requestId, reenqueued);
	}
	public async getTemplateInfo(): Promise<any> {
		const templateIds = await this.getAvailableTemplateIds();
		const templates = {};

		for (const id of templateIds) {
			// Get template costs from the NFT service
			const costs = await this.nft.getTemplateCosts(id);

			templates[id] = {
				id: id,
				name: `Template ${id}`,
				costs: costs,
				// Add more template metadata as needed
			};
		}

		return {
			availableTemplates: templateIds,
			templates: templates
		};
	}
	public async getTemplatePreview(templateId: number): Promise<any> {
		// Define the base path to templates
		const templateBasePath = path.join(process.cwd(), 'storage', 'ownable-templates');
		const templatePath = path.join(templateBasePath, `template${templateId}`);
		const assetsPath = path.join(templatePath, 'assets');

		// Check if template directory exists
		if (!await this.fileManagement.directoryExists(templatePath)) {
			this.loggingService.logError("SYSTEM", `Template directory not found: ${templatePath}`);
			return null;
		}

		try {
			// Check if assets directory exists
			if (!await this.fileManagement.directoryExists(assetsPath)) {
				this.loggingService.logError("SYSTEM", `Assets directory not found: ${assetsPath}`);
				return {
					templateId: templateId,
					exists: true,
					assets: false,
					files: []
				};
			}

			// Get list of files in assets directory
			const files = await fs.promises.readdir(assetsPath);

			// Check if index.html exists
			const hasIndexHtml = files.includes('index.html');

			// Get details about each file (size, type, etc)
			const fileDetails = await Promise.all(
				files.map(async (file) => {
					const filePath = path.join(assetsPath, file);
					const stats = await fs.promises.stat(filePath);
					return {
						name: file,
						path: `assets/${file}`,
						size: stats.size,
						isDirectory: stats.isDirectory(),
						modified: stats.mtime
					};
				})
			);

			// Return structured response
			return {
				templateId: templateId,
				exists: true,
				assets: true,
				hasIndexHtml: hasIndexHtml,
				files: fileDetails,
				totalFiles: fileDetails.length
			};
		} catch (err) {
			this.loggingService.logError("SYSTEM", `Error listing template files: ${err}`);
			return {
				templateId: templateId,
				exists: true,
				error: err.message
			};
		}
	}

	public async getAvailableNftChains(): Promise<any> {
		// Get available template IDs
		const availableTemplateIds = await this.getAvailableTemplateIds();

		// Get NFT data from the NFT service
		const nftData = await this.nft.getAvailableNftChains();

		// Add template info to the response
		if (nftData && nftData.arbitrum) {
			// Add available templates to mainnet
			if (nftData.arbitrum.mainnet) {
				nftData.arbitrum.mainnet.availableTemplates = availableTemplateIds;
			}

			// Add available templates to testnet
			if (nftData.arbitrum.testnet) {
				nftData.arbitrum.testnet.availableTemplates = availableTemplateIds;
			}
		}

		return nftData;
	}

	private async createEventChain(pkg: TypedPackage, nftInfo: NftInfo, receiver: string): Promise<Buffer> {
		return this.eventChainService.createEventChain(pkg, nftInfo, receiver);
	}


	public getServerLtoWalletAddresses(): [string, string] {
		return [this.getLTOAccountAddress('L'), this.getLTOAccountAddress('T')];
	}
	public getServerEVMwalletAddresses(networkName: string): [string, string] {
		return this.nft.getEvmWalletAddresses(networkName);
	}
	public async templateCost(templateId: number): Promise<any> {
		return this.nft.getTemplateCosts(templateId);
	}
	public async checkTemplateExists(templateId: number): Promise<boolean> {
		const templatePath = `${this.pathToTemplates}/template${templateId}`;
		
		// Check if template directory exists
		if (!await this.fileManagement.directoryExists(templatePath)) {
			this.loggingService.logError("SYSTEM", `Template directory not found: ${templatePath}`);
			return false;
		}
		return true;		
	}

	private async readOwnableDataFromZip(files: Map<string, Buffer>) {
		try {
			return JSON.parse(files.get('ownableData.json').toString())[0];
		} catch (error) {
			throw (`Failed to read JSON file ownableData.json`);
		}
	}

	public async createPinataPinnedFile(picture: Buffer, name: string, description: string): Promise<string> {
		return this.pinataService.createPinnedFile(picture, name, description);
	}

	private async getSignerOfRequest(req: Request, ltoNetworkId: 'L' | 'T'): Promise<string> {
		// let signerAccountAddress: string;

		console.log("getSignerOfRequest: req headers", req.headers);
		console.log("getSignerOfRequest: req url", req.url);
		console.log("getSignerOfRequest: req method", req.method);
		console.log("getSignerOfRequest: req headers origin", req.headers.origin);
		console.log("getSignerOfRequest: req headers host", req.headers.host);

		const longUrl = req.headers.origin;
		const httpPartOfUrl = longUrl.split('//');
		const urlWithoutParams = req.url.split('?');
		const signedRequest = {
			headers: {
				'Signature': req.headers.signature,
				'Signature-Input': req.headers['signature-input']
			},
			url: `${httpPartOfUrl[0]}//${req.headers.host}${urlWithoutParams[0]}`,
			method: `${req.method}`
		}
		console.log("getSignerOfRequest: signedRequest:", signedRequest);
		let signerAccount: Account = null;
		// First try if request has been signed by mainnet account
		try {
			if (ltoNetworkId === 'L') {
				signerAccount = await verify(signedRequest, this.ltoService.ltoMainnet);
			} else if (ltoNetworkId === 'T') {
				signerAccount = await verify(signedRequest, this.ltoService.ltoTestnet);
			}
		} catch (err) {
			signerAccount = null;
			throw new UserError(
				`Invalid signed request on LTO network ${ltoNetworkId}. Not possible to extract signer. Signed Request: ${JSON.stringify(signedRequest)} Error: ${err}`
			);
		}


		console.log("getSignerOfRequest: Extracted signer from LtoRequest:", signerAccount.address);
		return signerAccount.address;

	}

	// Get all available template IDs
	private async getAvailableTemplateIds(): Promise<number[]> {
		try {
			const files = await fs.promises.readdir(this.pathToTemplates);
			const templateIds: number[] = [];

			for (const file of files) {
				const match = file.match(/template(\d+)$/);
				if (match && match[1]) {
					templateIds.push(Number(match[1]));
				}
			}

			// Sort numerically
			return templateIds.sort((a, b) => a - b);
		} catch (err) {
			this.loggingService.logError("SYSTEM", `Error reading template directory: ${err}`);
			// Fallback to hardcoded values if directory read fails
			return [1, 2, 3];
		}
	}

	// Check if template exists
	private async validateTemplateId(templateId: number): Promise<boolean> {
		if (!templateId) return false;

		const templatePath = `${this.pathToTemplates}/template${templateId}`;
		return await this.fileManagement.directoryExists(templatePath);
	}

	public async queueRequest(
		ltoNetworkId: 'L' | 'T',
		uint8ArrayData: Uint8Array,
		req: Request,
		externalTemplateId?: number,
		signedTransaction?: any
	  ): Promise<any> {
		let signerAccountAddress: string;
		try {
		  signerAccountAddress = await this.getSignerOfRequest(req, ltoNetworkId);
		  console.log("signerAccountAddress", signerAccountAddress);
		  console.log("getNetwork", getNetwork(signerAccountAddress));
		} catch (err) {
		  throw err;
		}
	  
		const relayURL = this.relayService.getRelayUrl();
		const isUp: boolean = await this.relayService.isRelayUp(relayURL);
		if (isUp) {
		  console.log(`oRelay Server ${relayURL} is up and running!`);
		}
		else {
		  throw new Error(`Error: oRelay Server ${relayURL} is down`);
		}
	  
		// if (!this.queueService.isQueueingAllowed(ltoNetworkId)) {
		//   throw new Error('Queueing of new Requests currently disabled!');
		// }
	  
		console.log("unzipping user input file into memory...");
  const requestIdFiles = await this.fileManagement.unzip(uint8ArrayData);

  const timeMillisecondsNow = Date.now().toString();
  requestIdFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

  console.log("getting request ID of input requestIdFiles...");
  const requestId: string = await this.fileManagement.getUniqueId(requestIdFiles);
  this.loggingService.log(requestId, `New Logging Service added for unique request ID: ${requestId}`);

  if (!requestIdFiles.has('ownableData.json')) {
    this.loggingService.logError(requestId, "Invalid package: 'ownableData.json' is missing");
    throw new Error("Invalid package: 'ownableData.json' is missing");
  }

  let jsonFile;
  try {
    jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
  } catch (err) {
    this.loggingService.logError(requestId, `${err}`);
    throw err;
  }

  // Validate NFT blockchain settings
  if (jsonFile.CREATE_NFT === 'true') {
    if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum')) {
      this.loggingService.logError(requestId, `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
      throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
    }
  } else {
    jsonFile.NFT_BLOCKCHAIN = 'noNFT';
  }
	  
  let templateId: number;
  let templateModified = false;

  console.log("externalTemplateId", externalTemplateId);
  
  if (externalTemplateId !== undefined) {
    // Validate that template exists
    const templatePath = `${this.pathToTemplates}/template${externalTemplateId}`;
    const templateExists = await this.fileManagement.directoryExists(templatePath);

    if (!templateExists) {
      this.loggingService.logError(requestId, `Template with ID ${externalTemplateId} does not exist`);
      throw new Error(`Template with ID ${externalTemplateId} does not exist`);
    }

    templateId = externalTemplateId;
    this.loggingService.log(requestId, `Using external templateId: ${templateId}`);
    
  } else {   
	console.log("jsonFile", jsonFile);
    templateId = this.fileManagement.getTemplateIdNumber(jsonFile, requestId);
	console.log("templateId", templateId);
	if (isNaN(templateId)) {	 		
		this.loggingService.logError(requestId, `Template ID is not a number`);
    	throw new Error(`Template ID is not a number`);		
	}
	const templateExists = await this.checkTemplateExists(templateId);
			if (!templateExists) {
				this.loggingService.logError(requestId, `Template not found for template ID: ${templateId}`);
    	throw new Error(`Template not found for template ID: ${templateId}`);	
				
			}
    

    this.loggingService.log(requestId, `Extracted templateId from zip: ${templateId}`);
  }
	  
		 // If template was modified, update the JSON in the zip
		 if (templateModified) {
			const updatedJsonBuffer = Buffer.from(JSON.stringify(jsonFile));
			requestIdFiles.set('ownableData.json', updatedJsonBuffer);
		
			// Re-zip the updated files
			uint8ArrayData = await this.fileManagement.zipMap(requestIdFiles);
		  }
		
		  // Store signed transaction for later if provided
		  if (signedTransaction) {
			this.loggingService.log(requestId, `Signed transaction provided, storing for later broadcast`);
			await this.storeSignedTransaction(requestId, ltoNetworkId, signedTransaction);
		  }
		
		  // Check LTO transaction ID
		  let transactionIdData: TransactionIdData;
		
		// If a transaction ID is provided in the JSON, verify it
		if (jsonFile.OWNABLE_LTO_TRANSACTION_ID) {
			try {
			  await this.wait(10000);
			  transactionIdData = await this.checkLtoTransactionId(
				ltoNetworkId,
				jsonFile.OWNABLE_LTO_TRANSACTION_ID,
				templateId,
				jsonFile.NFT_BLOCKCHAIN,
				requestId,
				false
			  );
			  this.loggingService.log(requestId, `transactionIdData:` + JSON.stringify(transactionIdData));
			  
			  // Verify signer
			  if (signerAccountAddress !== transactionIdData.sender) {
				throw new UserError(`Error: Signer of Ownable request ${signerAccountAddress} did not sign transactionID ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}. Signer of TXID:${transactionIdData.sender}`);
			  }
			} catch (err) {
			  this.loggingService.logError(requestId, `${err}`);
			  throw new Error(err);
			}
		  }
		  // If no transaction ID in JSON but signed transaction provided, we'll validate after broadcasting in the store function
		  else if (signedTransaction) {
			this.loggingService.log(requestId, `No transaction ID in JSON, will validate after broadcasting during Ownable creation`);
			// Use the signed transaction's sender as the transaction data since we haven't broadcast yet
			transactionIdData = {
			  type: 4, // Transfer type
			  sender: signerAccountAddress,
			  recipient: this.getLTOAccountAddress(ltoNetworkId),
			  amount: 0 // We don't know this yet as we haven't broadcast
			};
		  } 
		  // Neither transaction ID nor signed transaction provided
		  else {
			this.loggingService.logError(requestId, `No transaction ID in JSON and no signed transaction provided`);
			throw new Error(`Missing transaction ID and signed transaction`);
		  }
		
		  // Add to queue
		  let entry: QueueEntry;
		  try {
			entry = await this.queueService.enqueue(
			  ltoNetworkId,
			  requestId,
			  uint8ArrayData,
			  transactionIdData.sender,
			  jsonFile.OWNABLE_LTO_TRANSACTION_ID || '', // Use empty string if we don't have txID yet
			  templateId
			);
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
			if (firstEntry.rid && firstEntry.rid !== '' && !this.queueService.canProcessNewEntry() && firstEntry.timestampProcessing > 0 && timestampNow - queryProcessingEntry[0].timestampProcessing >= 300) {
				this.loggingService.log(firstEntry.rid, `Something went wrong with processing Queue Entry. Failed to produce Ownable ` + JSON.stringify(queryProcessingEntry[0]));
				await this.queueService.ownableFailed(ltoNetworkId, queryProcessingEntry[0].rid, "More than 300 seconds inactive in Processing Queue");
			}
		}		
	}
	private async checkQueueStatus() {
		// this.checkForFailedEntries('L');
		// this.checkForFailedEntries('T');

		const isEmpty = this.queueService.isQueueEmpty();
		if (!isEmpty) {
			console.log("checkQueueStatus: Checking Queue Status: queue not empty...");
			try {
				const relayURL = this.relayService.getRelayUrl();
				const isUp: boolean = await this.relayService.isRelayUp(relayURL);
				if (isUp) {

					if (this.queueService.canProcessNewEntry()) {
						console.log("checkQueueStatus: canProcessNewEntry: true");
						await this.wait(10000);
						let ltoNetworkId, requestId, data, sender, reenqueued_NFTURI, reenqueued_NFTINFO, reenqueued = false;
						try {
							[ltoNetworkId, requestId, data, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO] = await this.queueService.processNextQueueEntry();
							console.log("checkQueueStatus: processNextQueueEntry: ", ltoNetworkId, requestId, data, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO);
						} catch (err) {
							this.loggingService.logError(requestId, `processNextQueueEntry failed on lto network ${ltoNetworkId}: ${err}`);
						}

						if (requestId != null && data != null) {
							console.log("checkQueueStatus: store: ", ltoNetworkId, requestId, data, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO);
							try {
								await this.store(ltoNetworkId, requestId, data, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO);
								console.log("checkQueueStatus: store: ", ltoNetworkId, requestId, data, sender, reenqueued, reenqueued_NFTURI, reenqueued_NFTINFO);
							} catch (err) {
								const queryProcessingEntry1: QueueEntry[] = this.queueService.getQueueEntriesByStatus(ltoNetworkId, OwnableStatus.Processing);
								// Check if there are any entries before accessing .rid
    							if (queryProcessingEntry1 && queryProcessingEntry1.length > 0) {
        							this.loggingService.log(queryProcessingEntry1[0].rid, `Ownable creation failed on lto network ${ltoNetworkId}: ${err}`);
        							try {
            							await this.queueService.ownableFailed(ltoNetworkId, queryProcessingEntry1[0].rid, `${err}`);
        							} catch (e) {
            							this.loggingService.log(queryProcessingEntry1[0].rid, `Setting Ownable Failed failed on lto network ${ltoNetworkId}: ${e}`);
            							throw (e);
        							}
    							} else {
									// Log with a generic message or use requestId if available
									const logId = requestId || 'unknown';
									this.loggingService.log(logId, `Ownable creation failed on lto network ${ltoNetworkId}, but no processing entries found: ${err}`);
								}
   					
							}
						}
					}
				}
				else {					
					throw new Error(`Error: oRelay Server ${relayURL} is down`);
				}
			} catch (err) {
				throw err;
			}
		}


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
	public getQueueEntriesByWallet(wallet: string): QueueEntry[] {
		if (this.isValidLtoAddress(wallet) === "false") {
			return [];
		}
		if (getNetwork(wallet) === 'L') {
			return this.queueService.getQueueEntriesByWallet('L', wallet);
		} else {
			return this.queueService.getQueueEntriesByWallet('T', wallet);

		}
	}
	public getQueueEntriesByStatus(ltoNetworkId: 'L' | 'T', status: OwnableStatus): QueueEntry[] {
		return this.queueService.getQueueEntriesByStatus(ltoNetworkId, status);
	}

	public queueStatus(): any {
		let isOwnableBeingBuild: string = '';
		// let isQueueingAllowed: boolean = true;
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
			
			currentlyProcessedQueueEntry = this.queueService.getQueueEntriesByStatus(networkId, OwnableStatus.Processing);
		} else {
			currentlyProcessedQueueEntry.push(defaultQueueEntry);
		}
		// const timeElapsed = this.queueBusyTimer * 10; // queueBusytimer is increased each 10 seconds by one

		return {
			creatingOwnable: isOwnableBeingBuild,			
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
	private wait = (n: number) => new Promise((resolve) => setTimeout(resolve, n));



	public async store(
		ltoNetworkId: 'L' | 'T',
		requestId: string,
		data: Uint8Array,
		sender: string,
		reenqueued: boolean,
		reenqueued_NFTURI: string,
		reenqueued_NFTINFO: NftInfo		
	  ) {
		// Get and save local reference to queue entry
		let queueEntry: QueueEntry | null = null;
		let queueIndex: number = -1;

		try {
		   [queueEntry, queueIndex] = this.queueService.getQueueEntryByRequestId(ltoNetworkId, requestId);
    
    if (!queueEntry || queueIndex === -1) {
      this.loggingService.logError(requestId, `Queue entry not found at beginning of processing`);
      throw new Error("Queue entry not found");
    }
    
    this.loggingService.log(requestId, `Unzipping user input files for Ownable creation into memory`);
    const requestIdFiles = await this.fileManagement.unzip(data);
	  
		  if (!requestIdFiles.has('ownableData.json')) {
			this.loggingService.logError(requestId, `Invalid package: 'ownableData.json' is missing in requestId: ${requestId}`);
			throw new Error("Invalid package: 'ownableData.json' is missing");
		  }
	  
		  const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
		  this.loggingService.log(requestId, `jsonFile: ${JSON.stringify(jsonFile)}`);
	  
		  // Sanitize package name if needed
		  if (this.fileManagement.isValidPackageName(jsonFile.PLACEHOLDER1_NAME)) {
			this.loggingService.log(requestId, `Valid package PLACEHOLDER1_NAME. ${jsonFile.PLACEHOLDER1_NAME}`);
		  } else {
			this.loggingService.log(requestId, `Sanitizing invalid characters in PLACEHOLDER1_NAME: ${jsonFile.PLACEHOLDER1_NAME}`);
			const sanitized_PLACEHOLDER1_NAME = this.fileManagement.sanitizePackageName(jsonFile.PLACEHOLDER1_NAME, false);
			const sanitized_PLACEHOLDER2_IMG = this.fileManagement.sanitizePackageName(jsonFile.PLACEHOLDER2_IMG, true);
			
			// Update file references
			if (requestIdFiles.has(jsonFile.PLACEHOLDER2_IMG)) {
			  const bufferValue = requestIdFiles.get(jsonFile.PLACEHOLDER2_IMG);
			  if (jsonFile.PLACEHOLDER2_IMG !== sanitized_PLACEHOLDER2_IMG) {
				requestIdFiles.set(sanitized_PLACEHOLDER2_IMG, bufferValue);
				requestIdFiles.delete(jsonFile.PLACEHOLDER2_IMG);
			  }
			}
			
			this.loggingService.log(requestId, `OLD: ${jsonFile.PLACEHOLDER1_NAME}  NEW: ${sanitized_PLACEHOLDER1_NAME}`);
			this.loggingService.log(requestId, `OLD: ${jsonFile.PLACEHOLDER2_IMG}  NEW: ${sanitized_PLACEHOLDER2_IMG}`);
			jsonFile.PLACEHOLDER1_NAME = sanitized_PLACEHOLDER1_NAME;
			jsonFile.PLACEHOLDER2_IMG = sanitized_PLACEHOLDER2_IMG;
		  }
	  
		  // Validate blockchain settings
		  if (jsonFile.CREATE_NFT === 'true') {
			if (!(jsonFile.NFT_BLOCKCHAIN === 'arbitrum')) {
			  this.loggingService.logError(requestId, `Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
			  throw new Error(`Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`);
			}
		  } else {
			jsonFile.NFT_BLOCKCHAIN = 'noNFT';
		  }
	  
		  // Get templateId from queue entry
		  let templateId: number;
		//   let templateModified = false;	

    if (queueEntry && queueEntry.templateId !== undefined) {
      // Use templateId from queue entry
      templateId = queueEntry.templateId;
      this.loggingService.log(requestId, `Using templateId from queue entry: ${templateId}`);

     
    } else {
      // Fallback to extracting from JSON
      templateId = this.fileManagement.getTemplateIdNumber(jsonFile, requestId);
      this.loggingService.log(requestId, `Extracted templateId from JSON: ${templateId}`);
    }

    // Update JSON if needed
    // if (templateModified) {
    //   const updatedJsonBuffer = Buffer.from(JSON.stringify(jsonFile));
    //   requestIdFiles.set('ownableData.json', updatedJsonBuffer);
    // }

    // Validate transaction ID if already present in JSON (pre-existing transaction)
    let transactionIdData: TransactionIdData;
    let usedExistingTransaction = false;
    
    if (jsonFile.OWNABLE_LTO_TRANSACTION_ID && !this.signedTransactions.has(requestId)) {
      this.loggingService.log(requestId, `Validating existing transaction ID: ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}`);
      
      try {
        transactionIdData = await this.checkLtoTransactionId(
          ltoNetworkId,
          jsonFile.OWNABLE_LTO_TRANSACTION_ID,
          templateId,
          jsonFile.NFT_BLOCKCHAIN,
          requestId,
          reenqueued
        );
        usedExistingTransaction = true;
        this.loggingService.log(requestId, `Existing transaction validated: ${JSON.stringify(transactionIdData)}`);
      } catch (err) {
        this.loggingService.logError(requestId, `Error validating existing transaction: ${err}`);
        throw err;
      }
    }

    // Create NFT first if needed
    let nftInfo: NftInfo;
    
	  
	if (jsonFile.CREATE_NFT === 'true') {
		const picture: Buffer = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
		this.loggingService.log(requestId, `Creating S3 image File for NFT Token URI...`);
		
		try {
		  if (!reenqueued || reenqueued_NFTURI === '') {
			jsonFile.NFT_TOKEN_URI = await this.createPinataPinnedFile(picture, jsonFile.PLACEHOLDER1_NAME, jsonFile.PLACEHOLDER1_DESCRIPTION);
		  } else {
			jsonFile.NFT_TOKEN_URI = reenqueued_NFTURI;
		  }
		} catch (err) {
		  this.loggingService.logError(requestId, `Creating S3 image File failed: ${err}`);
		  throw err;
		}
  
		this.loggingService.log(requestId, `NFT Token URI: ${jsonFile.NFT_TOKEN_URI}`);
		
		try {
		  if (!reenqueued) {
			nftInfo = await this.nft.mintNewNft(ltoNetworkId, jsonFile, requestId);
		  } else {
			nftInfo = reenqueued_NFTINFO;
		  }
		} catch (err) {
		  this.loggingService.logError(requestId, `Minting NFT failed: ${err}`);
		  throw err;
		}
  
		jsonFile.PLACEHOLDER1_KEYWORDS.push("hasNFT");
	  } else {
		nftInfo = {
		  network: "",
		  address: "",
		  id: 0
		};
		jsonFile.PLACEHOLDER1_KEYWORDS.push("noNFT");
	  }
	  
	  try {
		// Step 2: Create the Ownable
		this.loggingService.log(requestId, `Creating Ownable for request ID ${requestId}...`);
		
		// Build the Ownable first but don't send it yet
		const ownableData = await this.buildOwnable(ltoNetworkId, requestId, jsonFile, nftInfo, sender, requestIdFiles, queueEntry.templateId);
		
		
		// Step 3: Process payment transaction just before sending
		if (this.signedTransactions && this.signedTransactions.has(requestId)) {
		  this.loggingService.log(requestId, `Found signed transaction for request ID: ${requestId}`);
		  
		  const storedTx = this.signedTransactions.get(requestId);
		  
		  // Verify network matches
		  if (storedTx.ltoNetworkId !== ltoNetworkId) {
			this.loggingService.logError(
			  requestId, 
			  `Transaction network (${storedTx.ltoNetworkId}) doesn't match ownable network (${ltoNetworkId})`
			);
			throw new Error('Transaction network mismatch');
		  }
		  
		  // Now broadcast the transaction
		  this.loggingService.log(requestId, `Broadcasting payment transaction before sending ownable...`);
		  const txResult = await this.broadcastTransaction(ltoNetworkId, storedTx.transaction, requestId);
		  this.loggingService.log(requestId, `Transaction broadcast successful with ID: ${txResult.id}`);
		  
		  // Now validate the transaction
		  try {
			this.loggingService.log(requestId, `store: Validating newly broadcast transaction: ${txResult.id}`);
			
			// Wait for transaction to be confirmed
			this.loggingService.log(requestId, `store: Waiting for transaction confirmation (10 seconds)...`);
			await new Promise(resolve => setTimeout(resolve, 10000));
			
			transactionIdData = await this.checkLtoTransactionId(
			  ltoNetworkId,
			  txResult.id,
			  templateId,
			  jsonFile.NFT_BLOCKCHAIN,
			  requestId,
			  false
			);
			// Remove stored transaction
			this.signedTransactions.delete(requestId);

			this.loggingService.log(requestId, `store: Transaction validation successful: ${JSON.stringify(transactionIdData)}`);
		  } catch (err) {
			this.loggingService.logError(requestId, `store: Transaction validation failed: ${err}`);
			throw new Error(`Payment transaction validation failed: ${err.message}`);
		  }
		  
		  // Update queue entry with transaction ID
		  const [entry, index] = this.queueService.getQueueEntryByRequestId(ltoNetworkId, requestId);
		  console.log("store1: entry", entry);
		  console.log("store1: index", index);

		  if (entry && index !== -1) {
			entry.paymentTransactionId = txResult.id;
			// If transaction wasn't in the original JSON, update that too
			if (!jsonFile.OWNABLE_LTO_TRANSACTION_ID) {
			  entry.txId = txResult.id;
			}
			
			if (ltoNetworkId === 'L') {
			  this.queueService.queueMainnet[index] = entry;
			} else {
			  this.queueService.queueTestnet[index] = entry;
			}
			await this.queueService.updateQueueInS3Bucket(ltoNetworkId);	
		
			console.log("store: queueTestnet", this.queueService.queueTestnet);
		  }

		  // Remove the stored transaction
		  this.signedTransactions.delete(requestId);

		  this.loggingService.log(requestId, `Payment transaction processed successfully`);
		} else if (!usedExistingTransaction) {
		  this.loggingService.logError(requestId, `No payment transaction found for request ID: ${requestId}`);
		  throw new Error(`No payment transaction found`);
		}
		// Update queue status to Ready
		await this.queueService.setQueueEntryStatus(ltoNetworkId, requestId, OwnableStatus.Ready);
		// Step 4: Send the Ownable
		this.loggingService.log(requestId, `Sending Ownable...`);
		const hash = await this.sendOwnable(ltoNetworkId, requestId, sender, ownableData.zipContent);

		// Update status in S3
		if (ownableData.cid) {
		  await this.queueService.setQueueEntryStatus(ltoNetworkId, requestId, OwnableStatus.Sent, hash);
		}	

		this.loggingService.log(requestId, `Ownable sent successfully with hash: ${hash}`);
		return hash;
	  } catch (err) {
		this.loggingService.logError(requestId, `Ownable creation or sending failed: ${err}`);
		throw err;
	  }
	} catch (err) {
	  throw err;
	}
	  }
	  
	  
	  // New helper method to build the Ownable without sending it
private async buildOwnable(
	ltoNetworkId: 'L' | 'T', 
	requestId: string, 
	jsonFile: any, 
	nftInfo: NftInfo, 
	sender: string, 
	requestIdFiles: Map<string, Buffer>,
	templateId: number
  ): Promise<{ zipContent: Uint8Array, cid: string }> {
	// This method extracts the Ownable creation logic from startOwnableCreation
	// but doesn't perform the final send
	
	this.loggingService.log(requestId, `Building Ownable...`);
	this.loggingService.log(requestId, `Copying template${templateId} to template directory for modification`);
  
	let cpCmdFrom = `${this.pathToTemplates}/template${templateId}`;
	let cpCmdTo = `ownables/${jsonFile.PLACEHOLDER1_NAME}`;
  
	try {
	  await this.fileManagement.copyDirectory(cpCmdFrom, cpCmdTo, requestId);
  
	  // Copy image files
	  const image = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
	  let filePath = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`;
	  await this.fileManagement.writeFile(filePath, image, requestId);
  
	  const thumbnail = requestIdFiles.get(`${jsonFile.OWNABLE_THUMBNAIL}`);
	  filePath = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`;
	  await this.fileManagement.writeFile(filePath, thumbnail, requestId);
  
	  // Set default author if missing
	  if (typeof jsonFile.PLACEHOLDER1_AUTHORS === 'undefined')
		jsonFile.PLACEHOLDER1_AUTHORS = '';
  
	  // Replace placeholders
	  await this.fileManagement.batchReplaceInFile('', [
		// ... existing replacements (unchanged)
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
		  searchValue: "PLACEHOLDER1_NAME",
		  replacement: `"${jsonFile.PLACEHOLDER1_NAME}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
		  searchValue: "PLACEHOLDER1_DESCRIPTION",
		  replacement: `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
		  searchValue: "PLACEHOLDER1_VERSION",
		  replacement: `"${jsonFile.PLACEHOLDER1_VERSION}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
		  searchValue: "PLACEHOLDER1_AUTHORS",
		  replacement: `"${jsonFile.PLACEHOLDER1_AUTHORS}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
		  searchValue: "PLACEHOLDER1_KEYWORDS",
		  replacement: arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS)
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`,
		  searchValue: "PLACEHOLDER2_TITLE",
		  replacement: `${jsonFile.PLACEHOLDER2_TITLE}`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`,
		  searchValue: "PLACEHOLDER2_IMG",
		  replacement: `"${jsonFile.PLACEHOLDER2_IMG}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`,
		  searchValue: "PLACEHOLDER3_MSG",
		  replacement: `${jsonFile.PLACEHOLDER1_NAME}`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`,
		  searchValue: "PLACEHOLDER3_STATE",
		  replacement: `${jsonFile.PLACEHOLDER1_NAME}`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
		  searchValue: "PLACEHOLDER4_CONTRACT_NAME",
		  replacement: `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
		  searchValue: "PLACEHOLDER4_TYPE",
		  replacement: `"${jsonFile.PLACEHOLDER4_TYPE}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
		  searchValue: "PLACEHOLDER4_DESCRIPTION",
		  replacement: `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`
		},
		{
		  filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
		  searchValue: "PLACEHOLDER4_NAME",
		  replacement: `"${jsonFile.PLACEHOLDER4_NAME}"`
		}
	  ], requestId);
	  // Check dependencies
	  await this.fileManagement.executeCommandWithLogging('cargo --version', requestId);
	  await this.fileManagement.executeCommandWithLogging('rustup --version', requestId);
	  await this.fileManagement.executeCommandWithLogging('wasm-pack --version', requestId);
  
	  // Build the ownable
	  this.loggingService.log(requestId, `Building Ownable...`);
	  await this.fileManagement.executeCommandWithNetworkLogging(
		ltoNetworkId,
		`npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`,
		requestId,
		{ env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } },
		this.queueService
	  );
  
	  const zipFile = `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`;
	  
	  // Wait for the zip file to be created
	  let timeout = 0;
	  while (!(await this.fileManagement.fileExists(zipFile))) {
		await this.wait(1000);
		timeout += 1;
		if (timeout >= 300) {
		  throw new Error(`Timeout waiting for zip file creation`);
		}
	  }
	  
	  this.loggingService.log(requestId, `Zip file created: ${zipFile}`);
	  
	  // Process the zip file to create a unique CID
	  const pkgFiles = await this.fileManagement.unzip(zipFile);
	  const timeMillisecondsNow = Date.now().toString();
	  pkgFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

	  // Before creating the CID, modify package.json
	  if (pkgFiles.has('package.json')) {
		try {
			// Get and parse package.json
			const packageJsonBuffer = pkgFiles.get('package.json');
			const packageJson = JSON.parse(packageJsonBuffer.toString());

			// Update the name field
			packageJson.name = jsonFile.PLACEHOLDER4_NAME;
			
			// Add a log to see the exact format
            this.loggingService.log(requestId, `Updated package.json content: ${JSON.stringify(packageJson, null, 2)}`);

			// Convert back to Buffer and update in pkgFiles
			const updatedPackageJson = Buffer.from(JSON.stringify(packageJson, null, 2));
			pkgFiles.set('package.json', updatedPackageJson);
			
			this.loggingService.log(requestId, `Updated package.json name to: ${jsonFile.PLACEHOLDER4_NAME}`);
		} catch (err) {
			this.loggingService.logError(requestId, `Failed to update package.json: ${err.message}`);
			throw err;
		}
	}
	  // Generate unique CID
	  const cid = await this.fileManagement.getUniqueId(pkgFiles);
	  this.loggingService.log(requestId, `Generated CID: ${cid}`);
	  
	  // Store NFT info
	  await this.queueService.setCidNftInfo(ltoNetworkId, requestId, cid, nftInfo, jsonFile.NFT_TOKEN_URI);
	  
	  // Prepare the files for storing
	  const ownableZip = `${this.pathToCids}/${cid}/${cid}.zip`;
	  await this.fileManagement.copyFile(zipFile, ownableZip);
	  await this.fileManagement.deleteFile(zipFile);
	  await this.fileManagement.cleanupDirectory(`ownables/${jsonFile.PLACEHOLDER1_NAME}`);
	  
	  // Create package metadata
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
	  
	  // Create event chain
	  const chainBuffer = await this.createEventChain(pkgOwnable, nftInfo, sender);
	  pkgFiles.set('chain.json', chainBuffer);
	  
	  // Store files
	  await this.fileManagement.storeFiles(`${this.pathToCids}/${cid}`, cid, pkgFiles);
	  
	  // Create final zip with chain
	  const zipFile_buffer = await this.fileManagement.readFile(`${this.pathToCids}/${cid}/${cid}.zip`);
	  const new_zip = new JSZip();
	  await new_zip.loadAsync(zipFile_buffer);
	  
	  const eventChainJsonFile = await this.fileManagement.readFile(`${this.pathToCids}/${cid}/${cid}.json`);
	  new_zip.file('chain.json', eventChainJsonFile);
	  new_zip.file('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));
	  
	  const zipContent = await new_zip.generateAsync({ type: "uint8array" });
	  
	  
	 
	  // Store in S3
	  await this.s3.storeZip(ltoNetworkId, cid, requestId, sender, zipContent);
	  
	  return { zipContent, cid };
	} catch (err) {
	  this.loggingService.logError(requestId, `Failed to build Ownable: ${err.message}`);
	  
	  // Cleanup
	  try {
		await this.fileManagement.executeCommandWithLogging(
		  `rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME}`,
		  requestId
		);
	  } catch (cleanupErr) {
		this.loggingService.logError(requestId, `Cleanup failed: ${cleanupErr.message}`);
	  }
	  
	  throw err;
	}
  }
	  
	  /**
 * Retrieves the ownable content for a given request ID
 * @param ltoNetworkId Network identifier ('L' for mainnet, 'T' for testnet)
 * @param requestId Request ID for the ownable
 * @returns The ownable file content as Uint8Array
 */
public async getOwnableContent(ltoNetworkId: 'L' | 'T', requestId: string): Promise<Uint8Array> {
	try {
	  // Get the queue entry to find the CID
	  const [entry, _] = this.queueService.getQueueEntryByRequestId(ltoNetworkId, requestId);
	  
	  if (!entry || !entry.cid) {
		this.loggingService.logError(requestId, `Cannot find ownable content for requestId: ${requestId}. Missing entry or CID.`);
		throw new Error(`Cannot find ownable content for requestId: ${requestId}. Missing entry or CID.`);
	  }
	  
	  // Get the content from S3
	  const zipContent = await this.s3.getZip(ltoNetworkId, entry.cid, requestId, entry.ltoWallet);
	  
	  if (!zipContent) {
		this.loggingService.logError(requestId, `Failed to retrieve ownable content from storage for requestId: ${requestId}`);
		throw new Error(`Failed to retrieve ownable content from storage for requestId: ${requestId}`);
	  }
	  
	  return zipContent;
	} catch (error) {
	  this.loggingService.logError(requestId, `Error getting ownable content: ${error.message}`);
	  
	  // Check if this is a queue-related error
	  if (error.message.includes('Missing entry or CID')) {
		// Try to update queue entry status if possible to avoid further attempts
		try {
		  await this.queueService.ownableFailed(ltoNetworkId, requestId, error.message);
		} catch (queueErr) {
		  this.loggingService.logError(requestId, `Failed to update queue status: ${queueErr.message}`);
		}
	  }
	  
	  throw error;
	}
  }

	// private async watchFileCreation(ltoNetworkId: 'L' | 'T', zipFile1: string, jsonFile: any, nftInfo: NftInfo, sender: string, rid: string) {
	// 	this.loggingService.log(rid, `Ownable creation startet. Waiting for Zip File ${zipFile1} to be created...`);

	// 	let timeout = 0;
	// 	while (!(await this.fileManagement.fileExists(zipFile1))) {
	// 		this.wait(1000);
	// 		timeout += 1;
	// 		if (timeout >= 300) {
	// 			break;
	// 		}
	// 	}
	// 	this.loggingService.log(rid, `Zip File ${zipFile1} Created successfully.`);
	// 	this.loggingService.log(rid, `Unzipping to produce unique cid...`);
	// 	let pkgFiles: any;
	// 	try {
	// 		pkgFiles = await this.fileManagement.unzip(zipFile1);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Unzipping ${zipFile1} failed`);
	// 		throw err;
	// 	}

	// 	// adding a timestamp file to the Ownable to guarantee uniqueness for the CID
	// 	const timeMillisecondsNow = Date.now().toString();
	// 	pkgFiles.set('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));
	// 	this.loggingService.log(rid, `Added unique timestamp.txt ${timeMillisecondsNow} for creating a unique package CID`);

	// 	this.loggingService.log(rid, `getting unique chain ID from created ownable zip files ...`);
	// 	let cid: any;
	// 	try {
	// 		cid = await this.fileManagement.getUniqueId(pkgFiles);
	// 		console.log("cid", cid); // bafybeihdb2sxegxk52crm5xkxond2cvdqdue5lzhqzloj2dae4ivzqls5i


	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `getting unique CID failed`);
	// 		throw err;
	// 	}

	// 	this.loggingService.log(rid, `setCidNftInfo rid ${rid}`);
	// 	this.loggingService.log(rid, `setCidNftInfo cid ${cid}`);
	// 	this.loggingService.log(rid, `setCidNftInfo nftInfo` + JSON.stringify(nftInfo));
	// 	this.loggingService.log(rid, `setCidNftInfo nft TOken URI ${jsonFile.NFT_TOKEN_URI}`);
	// 	try {
	// 		await this.queueService.setCidNftInfo(ltoNetworkId, rid, cid, nftInfo, jsonFile.NFT_TOKEN_URI);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `setting Cid Nft Info failed`);
	// 		throw err;
	// 	}

	// 	const ownableZip = `${this.pathToCids}/${cid}/${cid}.zip`;
	// 	this.loggingService.log(rid, `Storing new Ownable zip file and deleting the source Ownable zip ...`);
	// 	try {
	// 		await this.fileManagement.copyFile(zipFile1, ownableZip);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Error cpSync ${zipFile1}. Error: ${err}`);
	// 		throw err;
	// 	}

	// 	try {
	// 		await this.fileManagement.deleteFile(zipFile1);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Error rmSync ${zipFile1}. Error: ${err}`);
	// 		throw err;
	// 	}
	// 	try {
	// 		await this.fileManagement.cleanupDirectory(`ownables/${jsonFile.PLACEHOLDER1_NAME}`);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Error rmSync ownables/${jsonFile.PLACEHOLDER1_NAME}. Error: ${err}`);
	// 		throw err;
	// 	}

	// 	const pkgOwnable: TypedPackage = {
	// 		isDynamic: true,
	// 		hasMetadata: false,
	// 		hasWidgetState: false,
	// 		isConsumable: false,
	// 		isConsumer: false,
	// 		isTransferable: true,
	// 		title: jsonFile.PLACEHOLDER2_TITLE.toString(),
	// 		name: jsonFile.PLACEHOLDER1_NAME.toString(),
	// 		description: jsonFile.PLACEHOLDER1_DESCRIPTION.toString(),
	// 		cid: `${cid}`,
	// 		versions: [jsonFile.PLACEHOLDER1_VERSION.toString()],
	// 		keywords: jsonFile.PLACEHOLDER1_KEYWORDS
	// 	};
	// 	this.loggingService.log(rid, `Creating the EventChain for the new Ownable. Pkg:` + JSON.stringify(pkgOwnable));


	// 	let chainBuffer: Buffer;
	// 	try {
	// 		chainBuffer = await this.createEventChain(pkgOwnable, nftInfo, sender); // sender from TX ID is new ownable owner
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Create Event Chain failed ${nftInfo} ${sender} Error: ${err}`);
	// 		throw err;
	// 	}

	// 	pkgFiles.set('chain.json', chainBuffer);

	// 	try {
	// 		await this.fileManagement.storeFiles(`${this.pathToCids}/${cid}`, cid, pkgFiles);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Storing files failed ${this.pathToCids}/${cid} Error: ${err}`);
	// 		throw err;
	// 	}

	// 	var new_zip = new JSZip();

	// 	let zipFile: Buffer;
	// 	try {
	// 		// await this.fileManagement.readTextFile(file);
	// 		zipFile = await this.fileManagement.readFile(`${this.pathToCids}/${cid}/${cid}.zip`);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Reading File failed ${this.pathToCids}/${cid}/${cid}.zip Error: ${err}`);
	// 		throw err;
	// 	}
	// 	try {
	// 		await new_zip.loadAsync(zipFile);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Loading async File failed. Error: ${err}`);
	// 		throw err;
	// 	}
	// 	let eventChainJsonFile: Buffer;
	// 	try {
	// 		eventChainJsonFile = await this.fileManagement.readFile(`${this.pathToCids}/${cid}/${cid}.json`);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Reading File failed ${this.pathToCids}/${cid}/${cid}.json Error: ${err}`);
	// 		throw err;
	// 	}
	// 	this.loggingService.log(rid, `Adding chain.json to new zip ${JSON.stringify(eventChainJsonFile)}`);
	// 	new_zip.file('chain.json', eventChainJsonFile);
	// 	this.loggingService.log(rid, `Unique timestamp file to new zip`);
	// 	new_zip.file('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

	// 	let zipContent: Uint8Array;
	// 	try {
	// 		zipContent = await new_zip.generateAsync({ type: "uint8array" });
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Failed to generate Async new zip Content: ${err}`);
	// 		throw err;
	// 	}
	// 	// let queueEntrySnapshot = null;
	// 	try {
	// 		// Before setting to Ready, check if entry exists
	// 		this.loggingService.log(rid, `PRE-READY: Checking queue entry`);
	// 		const [preEntry, preIndex] = this.queueService.getQueueEntryByRequestId(ltoNetworkId, rid);
	// 		this.loggingService.log(rid, `PRE-READY: Entry exists: ${!!preEntry}, index: ${preIndex}`);

	// 		await this.queueService.setQueueEntryStatus(ltoNetworkId, rid, OwnableStatus.Ready);
	// 		this.loggingService.log(rid, `Setting Queue entry status to Ready for ${rid}`);

	// 		// Get a snapshot of the queue entry after setting to Ready
	// 		const [readyEntry, readyIndex] = this.queueService.getQueueEntryByRequestId(ltoNetworkId, rid);
	// 		console.log("watchFileCreation: readyEntry", readyEntry);
	// 		console.log("watchFileCreation: readyIndex", readyIndex);
	// 		// if (readyEntry) {
	// 		// 	queueEntrySnapshot = JSON.parse(JSON.stringify(readyEntry)); // Deep copy
	// 		// 	this.loggingService.log(rid, `Saved queue entry snapshot with status ${OwnableStatus[readyEntry.ownableStatus]}`);
	// 		// } else {
	// 		// 	this.loggingService.logError(rid, `WARNING: Queue entry not found after setting to Ready`);
	// 		// }
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Failed to set Queue Entry status to Ready: ${err}`);
	// 		throw err;
	// 	}

	// 	// Store Package zip including new anchored eventChain to s3Bucket
	// 	try {
	// 		await this.s3.storeZip(ltoNetworkId, cid, rid, sender, zipContent);
	// 		this.loggingService.log(rid, `Stored successfully ${cid}_${rid}_${sender}_.zip on s3 Bucket`);
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Failed to store ${cid}_${rid}_${sender}_.zip on s3 Bucket: ${err}`);
	// 		throw err;
	// 	}

	// 	try {

	// 		// Send the file first
	// 		this.loggingService.log(rid, `Sending Ownable.. ltoNetworkId:${ltoNetworkId} rid:${rid} sender:${sender}`);
	// 		const hash = await this.sendOwnable(ltoNetworkId, rid, sender, zipContent);

	// 		// If we get here, the send was successful - log success without trying to update the queue
	// 		this.loggingService.log(rid, `Ownable successfully sent with hash: ${hash}`);
	// 		this.loggingService.log(rid, `Skipping queue update to avoid S3 conflicts`);

	// 		// Just return the hash directly
	// 		return hash;
	// 	} catch (err) {
	// 		this.loggingService.logError(rid, `Failed to send Ownable RID:${rid} SENDER:${sender}: ${err}`);
	// 		throw err;
	// 	}

	// }

	public async resendOwnableByRequestId(ltoNetworkId: 'L' | 'T', requestId: string): Promise<any> {
		let files: string[];
		if (ltoNetworkId === 'L') {
			files = await this.s3.s3BucketOwnables_L.list();
		} else {
			files = await this.s3.s3BucketOwnables_T.list();
		}
		console.log("Bucket files:", files);

		// Build the regex pattern
		const myReg = new RegExp(`^${requestId}_`, 'g');
		console.log('Regex pattern:', myReg);
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
			console.log("Matching file array:", filesArray);

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

	// private async startOwnableCreation(ltoNetworkId: 'L' | 'T', rid: string, jsonFile: any, nftInfo: NftInfo, sender: string, requestIdFiles: Map<string, Buffer>): Promise<string> {
	// 	this.loggingService.log(rid, `Starting Ownable creation...`);
	// 	this.loggingService.log(rid, `Copying ${jsonFile.template} to template directory for modification`);
	  
	// 	let cpCmdFrom = `${this.pathToTemplates}/${jsonFile.template}`;
	// 	let cpCmdTo = `ownables/${jsonFile.PLACEHOLDER1_NAME}`;
	  
	// 	try {
	// 		await this.fileManagement.copyDirectory(cpCmdFrom, cpCmdTo, rid); // Pass rid for logging

	// 		this.loggingService.log(rid, `Request ID: ${rid}`);
	// 		this.loggingService.log(rid, `PLACEHOLDER2_IMG: ${jsonFile.PLACEHOLDER2_IMG}`);
	// 		this.loggingService.log(rid, `OWNABLE_THUMBNAIL: ${jsonFile.OWNABLE_THUMBNAIL}`);

	// 		Copy image files
	// 		const image = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
	// 		let filePath = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`;
	// 		await this.fileManagement.writeFile(filePath, image, rid);

	// 		const thumbnail = requestIdFiles.get(`${jsonFile.OWNABLE_THUMBNAIL}`);
	// 		filePath = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.OWNABLE_THUMBNAIL}`;
	// 		await this.fileManagement.writeFile(filePath, thumbnail, rid);

	// 		Replace all placeholders in one batch operation
	// 		if (typeof jsonFile.PLACEHOLDER1_AUTHORS === 'undefined')
	// 			jsonFile.PLACEHOLDER1_AUTHORS = '';

	// 		await this.fileManagement.batchReplaceInFile('', [
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
	// 				searchValue: "PLACEHOLDER1_NAME",
	// 				replacement: `"${jsonFile.PLACEHOLDER1_NAME}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
	// 				searchValue: "PLACEHOLDER1_DESCRIPTION",
	// 				replacement: `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
	// 				searchValue: "PLACEHOLDER1_VERSION",
	// 				replacement: `"${jsonFile.PLACEHOLDER1_VERSION}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
	// 				searchValue: "PLACEHOLDER1_AUTHORS",
	// 				replacement: `"${jsonFile.PLACEHOLDER1_AUTHORS}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
	// 				searchValue: "PLACEHOLDER1_KEYWORDS",
	// 				replacement: arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS)
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`,
	// 				searchValue: "PLACEHOLDER2_TITLE",
	// 				replacement: `${jsonFile.PLACEHOLDER2_TITLE}`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`,
	// 				searchValue: "PLACEHOLDER2_IMG",
	// 				replacement: `"${jsonFile.PLACEHOLDER2_IMG}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`,
	// 				searchValue: "PLACEHOLDER3_MSG",
	// 				replacement: `${jsonFile.PLACEHOLDER1_NAME}`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`,
	// 				searchValue: "PLACEHOLDER3_STATE",
	// 				replacement: `${jsonFile.PLACEHOLDER1_NAME}`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
	// 				searchValue: "PLACEHOLDER4_CONTRACT_NAME",
	// 				replacement: `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
	// 				searchValue: "PLACEHOLDER4_TYPE",
	// 				replacement: `"${jsonFile.PLACEHOLDER4_TYPE}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
	// 				searchValue: "PLACEHOLDER4_DESCRIPTION",
	// 				replacement: `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`
	// 			},
	// 			{
	// 				filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
	// 				searchValue: "PLACEHOLDER4_NAME",
	// 				replacement: `"${jsonFile.PLACEHOLDER4_NAME}"`
	// 			}
	// 		], rid);

	// 		Check dependencies with logging
	// 		await this.fileManagement.executeCommandWithLogging('cargo --version', rid);
	// 		await this.fileManagement.executeCommandWithLogging('rustup --version', rid);
	// 		await this.fileManagement.executeCommandWithLogging('wasm-pack --version', rid);

	// 		Build the ownable
	// 		this.loggingService.log(rid, `Building Ownable...`);
	// 		await this.fileManagement.executeCommandWithNetworkLogging(
	// 			ltoNetworkId,
	// 			`npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`,
	// 			rid,
	// 			{ env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } },
	// 			this.queueService
	// 		);

	// 		Watch for zip file creation
	// 		const zipFileToWatch = `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`;
	// 		this.loggingService.log(rid, `Starting file watcher for zip file: ${zipFileToWatch}`);
	// 		return await this.watchFileCreation(ltoNetworkId, zipFileToWatch, jsonFile, nftInfo, sender, rid);
	// 	} catch (err) {
	// 	  this.loggingService.logError(rid, `Ownable creation process failed: ${err.message}`);
	  
	// 	  Cleanup on failure
	// 	  try {
	// 		await this.fileManagement.executeCommandWithLogging(
	// 		  `rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME}`,
	// 		  rid
	// 		);
	// 	  } catch (error) {
	// 		Just log cleanup errors but don't throw
	// 		this.loggingService.logError(rid, `Cleanup failed: ${error.message}`);
	// 	  }
	  
	// 	  throw err;
	// 	}
	//   }
}
