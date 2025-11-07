import {
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventChainService } from '../event-chain/event-chain.service';
import { FileManagementService } from '../file-management/file-management.service';
import { PinataService } from '../pinata/pinata.service';
import arrayToString from '../utils/arrayToString';
import JSZip from 'jszip';

// Dynamic imports for ES modules
let Event: any;
let EventChain: any;
let Message: any;
let Binary: any;

import { ethers } from 'ethers';
import { NftInfo } from '../interfaces/OwnableInfo';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { TypedPackage } from '../interfaces/TypedPackage';
import { IPFS } from '../interfaces/ipfs.interface';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { PinataSDK } from 'pinata';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';
import { NFTService } from '../nft/nft.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { UserError } from '../interfaces/error';
import { RedisQueueService } from '../queue/redis-queue.service';
import { LoggingService } from '../logging/redis-logging.service';
import { EqtyService } from '../eqty/eqty.service';
import { S3Service } from '../s3/s3.service';
import { CoinmarketcapService } from '../coinmarketcap/coinmarketcap.service';

import { packageInfo } from '../utils/package-info';
import { RelayService } from '../relay/relay.service';
import * as path from 'path';
import sharp from 'sharp';

export interface LogEntry {
  requestId: string;
  level: string;
  message: string;
  metadata?: any;
  timestamp: string;
  service: string;
}

@Injectable()
export class UploadZipService implements OnModuleInit, OnModuleDestroy {
  private pathToCids: string;
  private pathToTemplates: string;
  private packageInfo: any;
  private intervalId: NodeJS.Timeout;
  private nodeVersion = process.version;
  private pinata: PinataSDK;
  private ownableMeta: any;

  constructor(
    private readonly eventChainService: EventChainService,
    private readonly relayService: RelayService,
    private readonly fileManagement: FileManagementService,
    private readonly pinataService: PinataService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly eqtyService: EqtyService,
    private readonly nft: NFTService,
    private readonly queueService: RedisQueueService,
    private readonly s3: S3Service,
    private readonly coinmarketcap: CoinmarketcapService,
    private readonly loggingService: LoggingService,
    private readonly telegramService: TelegramBotService,
    @Inject('IPFS') private readonly ipfs: IPFS,
  ) {
    this.ownableMeta = {
      type: 'Ownable',
      title: 'Ownable',
      description: '',
    };
  }

  async onModuleInit() {
    await this.config.load();

    // Dynamic import of eqty-core ES module
    try {
      const eqtyCore = await import('eqty-core');
      Event = eqtyCore.Event;
      EventChain = eqtyCore.EventChain;
      Message = eqtyCore.Message;
      Binary = eqtyCore.Binary;
    } catch (error) {
      console.error('Failed to import eqty-core in UploadZipService:', error);
      throw error;
    }

    this.pinata = new PinataSDK({
      pinataJwt: this.config.get('pinata.jwt'), // process.env.PINATA_JWT!,
      pinataGateway: this.config.get('pinata.gateway'), // "example-gateway.mypinata.cloud",
    });

    this.packageInfo = packageInfo;

    this.pathToCids = this.packageInfo.ownableCidPath;
    this.pathToTemplates = this.packageInfo.ownableTemplatesPath;

    await this.fileManagement.ensureDirectoryExists(this.pathToCids);
    this.intervalId = setInterval(async () => {
      try {
        await this.checkQueueStatus();
      } catch (err) {
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

  public async GetServerETHBalance(
    networkId: 'L' | 'T',
    networkName: string,
  ): Promise<string> {
    const balance = await this.nft.getServerETHBalance(networkId, networkName);
    const numericBalance = parseFloat(balance);

    if (numericBalance <= 0.01) {
      // TODO: this comparison should be networkName specific
      // Handle case where balance is below or equal to 0.1
      console.log(`Balance is low: ${numericBalance}`);
      await this.telegramService.sendMessageToTelegramBot(
        networkId,
        `\n${networkName}: Balance is low: ${numericBalance}`,
      );
    }

    return balance;
  }
  public getLTOAccountAddress(networkId: 'L' | 'T'): string {
    return this.eqtyService.getEqtyAccountAddress(networkId);
  }
  public isEVMAddress(address: string): boolean {
    return this.nft.isEVMAddress(address);
  }
  public isValidLtoAddress(address: string): string {
    // For Base/Ethereum addresses, check if it's a valid Ethereum address
    if (address.startsWith('0x') && address.length === 42) {
      return 'L'; // Treat as mainnet for now
    }
    return 'false';
  }
  public async getLTOAccountBalance(networkId: 'L' | 'T') {
    return await this.eqtyService.getEqtyAccountBalance(networkId);
  }
  /**
   * Broadcasts a pre-signed transaction to the LTO Network
   * @param networkId Network identifier ('L' for mainnet, 'T' for testnet)
   * @param signedTransaction The pre-signed transaction object ready to broadcast
   * @param requestId Optional request ID for logging
   * @returns The response from the network node
   */
  public async broadcastTransaction(
    networkId: 'L' | 'T',
    signedTransaction: any,
    requestId?: string,
  ): Promise<any> {
    const rid = requestId || `broadcast-${Date.now()}`;

    try {
      // Use EQTY service to broadcast transaction
      const result = await this.eqtyService.broadcastTransaction(
        networkId,
        signedTransaction,
        rid,
      );
      this.loggingService.log(
        rid,
        `Transaction successfully broadcast with ID: ${result.id}`,
      );

      return result;
    } catch (err) {
      this.loggingService.logError(
        rid,
        `Broadcasting transaction failed: ${err}`,
      );
      throw err;
    }
  }
  // Add this property to store signed transactions
  private signedTransactions: Map<
    string,
    {
      networkId: 'L' | 'T';
      transaction: any;
    }
  > = new Map();

  /**
   * Stores a signed transaction for later broadcasting
   * @param requestId Request ID to associate the transaction with
   * @param networkId Network identifier ('L' for mainnet, 'T' for testnet)
   * @param signedTransaction The signed transaction data
   */
  public async storeSignedTransaction(
    requestId: string,
    networkId: 'L' | 'T',
    signedTransaction: any,
  ): Promise<void> {
    this.loggingService.log(
      requestId,
      `Storing signed transaction for request ID: ${requestId}`,
    );
    this.signedTransactions.set(requestId, {
      networkId,
      transaction: signedTransaction,
    });
  }

  public async getLogsByRequestId(requestId: string): Promise<LogEntry[]> {
    return await this.loggingService.getLogsByRid(requestId);
  }

  public async isRelayServerUp(): Promise<string> {
    return this.relayService.isRelayServerUp();
  }

  private async resizeToThumbnail(input: Buffer): Promise<any> {
    const resized = await sharp(input)
      .resize(50, 50)
      .webp({ quality: 80 })
      .toBuffer();

    if (resized.length > 256 * 1024) {
      throw new Error('Thumbnail exceeds 256KB');
    }

    return Binary.from(resized);
  }

  public async sendOwnable(
    networkId: 'L' | 'T',
    rid: string,
    recipient: string,
    content?: Uint8Array,
  ) {
    const metadata = this.ownableMeta;
    // Create a TypedPackage from the parameters
    const typedPackage: TypedPackage = {
      title: 'Ownable Package',
      name: 'ownable',
      description: 'Generated ownable package',
      cid: '',
      versions: [],
      keywords: [],
      isDynamic: false,
      hasMetadata: true,
      hasWidgetState: false,
      isConsumable: false,
      isConsumer: false,
      isTransferable: true,
    };

    return this.relayService.sendTypedPackage(
      typedPackage,
      rid, // sender
      recipient,
      rid, // requestId
    );
  }

  private async checkLtoTransactionId(
    networkId: 'L' | 'T',
    ltoTransactionId: string,
    templateId: number,
    chain: string,
    requestId: string,
    reenqueued: boolean,
  ): Promise<TransactionIdData> {
    try {
      // Get the expected server wallet address
      const expectedServerAddress = this.getLTOAccountAddress(networkId);

      // Get the expected payment amount (structure: templateCosts[networkId][chain].ETH)
      const templateCosts = await this.nft.getTemplateCosts(templateId);
      const expectedAmount = templateCosts[networkId]?.[chain]?.ETH || '0.001';

      console.log(
        `[${requestId}] Template costs:`,
        JSON.stringify(templateCosts, null, 2),
      );
      console.log(`[${requestId}] Expected amount: ${expectedAmount} ETH`);

      // Convert expected amount to Wei for comparison
      const expectedAmountWei = ethers.parseEther(expectedAmount);

      // Get provider for the network (Base, not Arbitrum)
      const provider = new ethers.AlchemyProvider(
        networkId === 'L' ? 'base' : 'base-sepolia',
        this.config.get('eth.account.arbitrum_alchemy_api_key'),
      );

      // Fetch the transaction
      const tx = await provider.getTransaction(ltoTransactionId);
      if (!tx) {
        throw new Error(`Transaction ${ltoTransactionId} not found`);
      }

      // Get transaction receipt to check if it's confirmed
      const receipt = await provider.getTransactionReceipt(ltoTransactionId);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction ${ltoTransactionId} not confirmed`);
      }

      // Validate recipient
      if (tx.to?.toLowerCase() !== expectedServerAddress.toLowerCase()) {
        throw new Error(
          `Invalid recipient. Expected: ${expectedServerAddress}, Got: ${tx.to}`,
        );
      }

      // Validate amount - allow ±10% tolerance for price fluctuations
      const amountDiff =
        tx.value > expectedAmountWei
          ? tx.value - expectedAmountWei
          : expectedAmountWei - tx.value;
      const tolerance = Number(expectedAmountWei) / 10; // 10% tolerance

      if (amountDiff > tolerance) {
        throw new Error(
          `Invalid amount. Expected: ~${ethers.formatEther(expectedAmountWei)} ETH (±10%), Got: ${ethers.formatEther(tx.value)} ETH`,
        );
      }

      // Validate timing (within last minute)
      const block = await provider.getBlock(tx.blockNumber!);
      const transactionTime = block.timestamp;
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = currentTime - transactionTime;

      if (timeDiff > 60) {
        // More than 1 minute ago
        throw new Error(
          `Transaction too old. Time difference: ${timeDiff} seconds`,
        );
      }

      this.loggingService.log(
        requestId,
        `Transaction ${ltoTransactionId} validated successfully`,
      );

      return {
        type: 0,
        sender: tx.from,
        recipient: tx.to!,
        amount: Number(ethers.formatEther(tx.value)),
        transactionId: ltoTransactionId,
        confirmed: true,
      };
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Transaction validation failed: ${error.message}`,
      );
      throw error;
    }
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
      templates: templates,
    };
  }
  public async getTemplatePreview(templateId: number): Promise<any> {
    // Define the base path to templates
    const templateBasePath = path.join(
      process.cwd(),
      'storage',
      'ownable-templates',
    );
    const templatePath = path.join(templateBasePath, `template${templateId}`);
    const assetsPath = path.join(templatePath, 'assets');

    // Check if template directory exists
    if (!(await this.fileManagement.directoryExists(templatePath))) {
      this.loggingService.logError(
        'SYSTEM',
        `Template directory not found: ${templatePath}`,
      );
      return null;
    }

    try {
      // Check if assets directory exists
      if (!(await this.fileManagement.directoryExists(assetsPath))) {
        this.loggingService.logError(
          'SYSTEM',
          `Assets directory not found: ${assetsPath}`,
        );
        return {
          templateId: templateId,
          exists: true,
          assets: false,
          files: [],
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
            modified: stats.mtime,
          };
        }),
      );

      // Return structured response
      return {
        templateId: templateId,
        exists: true,
        assets: true,
        hasIndexHtml: hasIndexHtml,
        files: fileDetails,
        totalFiles: fileDetails.length,
      };
    } catch (err) {
      this.loggingService.logError(
        'SYSTEM',
        `Error listing template files: ${err}`,
      );
      return {
        templateId: templateId,
        exists: true,
        error: err.message,
      };
    }
  }

  public async getAvailableNftChains(): Promise<any> {
    // Get available template IDs
    const availableTemplateIds = await this.getAvailableTemplateIds();

    // Get NFT data from the NFT service
    const nftData = await this.nft.getAvailableNftChains();

    // Add template info to the response
    if (nftData && nftData.base) {
      // Add available templates to mainnet
      if (nftData.base.mainnet) {
        nftData.base.mainnet.availableTemplates = availableTemplateIds;
      }

      // Add available templates to testnet
      if (nftData.base.testnet) {
        nftData.base.testnet.availableTemplates = availableTemplateIds;
      }
    }

    return nftData;
  }

  private async createEventChain(
    pkg: TypedPackage,
    nftInfo: NftInfo,
    receiver: string,
  ): Promise<string> {
    // For now, return a placeholder string since we need to create the EventChain first
    // This will need to be implemented properly with eqty-core
    return `eventchain_${receiver}_${Date.now()}`;
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
    if (!(await this.fileManagement.directoryExists(templatePath))) {
      this.loggingService.logError(
        'SYSTEM',
        `Template directory not found: ${templatePath}`,
      );
      return false;
    }
    return true;
  }

  private async readOwnableDataFromZip(files: Map<string, Buffer>) {
    try {
      return JSON.parse(files.get('ownableData.json').toString())[0];
    } catch (error) {
      throw `Failed to read JSON file ownableData.json`;
    }
  }

  public async createPinataPinnedFile(
    picture: Buffer,
    name: string,
    description: string,
  ): Promise<string> {
    return this.pinataService.createPinnedFile(picture, name, description);
  }

  private async getSignerOfRequest(
    req: Request,
    networkId: 'L' | 'T',
  ): Promise<string> {
    // For now, we'll extract the sender from the request body or headers
    // This is a simplified approach - in production, you might want to implement
    // proper authentication using JWT tokens or other methods

    console.log('getSignerOfRequest: req headers', req.headers);
    console.log('getSignerOfRequest: req url', req.url);
    console.log('getSignerOfRequest: req method', req.method);

    // Try to get sender from request body first
    const body = req.body;
    if (body && body.sender) {
      console.log(
        'getSignerOfRequest: Extracted sender from body:',
        body.sender,
      );
      return body.sender;
    }

    // Try to get sender from headers
    const senderHeader = req.headers['x-sender'] || req.headers['sender'];
    if (senderHeader) {
      console.log(
        'getSignerOfRequest: Extracted sender from headers:',
        senderHeader,
      );
      return senderHeader as string;
    }

    // Fallback: use a default sender (this should be replaced with proper auth)
    const defaultSender = this.eqtyService.getEqtyAccountAddress(networkId);
    console.log('getSignerOfRequest: Using default sender:', defaultSender);
    return defaultSender;
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
      this.loggingService.logError(
        'SYSTEM',
        `Error reading template directory: ${err}`,
      );
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
    networkId: 'L' | 'T',
    uint8ArrayData: Uint8Array,
    req: Request,
    externalTemplateId?: number,
    signedTransaction?: any,
  ): Promise<any> {
    let nftInfo: NftInfo | null = null;
    let signerAccountAddress: string;
    try {
      signerAccountAddress = await this.getSignerOfRequest(req, networkId);
      console.log(
        `[Upload] Network: ${networkId}, Sender: ${signerAccountAddress}`,
      );
    } catch (err) {
      throw err;
    }

    const relayURL = this.relayService.getRelayUrl();
    const isUp: boolean = await this.relayService.isRelayUp(relayURL);
    if (!isUp) {
      throw new Error(`Error: oRelay Server ${relayURL} is down`);
    }

    console.log(`[Upload] Unzipping package data...`);
    const requestIdFiles = await this.fileManagement.unzip(uint8ArrayData);

    const timeMillisecondsNow = Date.now().toString();
    requestIdFiles.set(
      'timestamp.txt',
      Buffer.from(timeMillisecondsNow, 'utf-8'),
    );

    const requestId: string =
      await this.fileManagement.getUniqueId(requestIdFiles);
    console.log(`[Upload] Request ID: ${requestId}`);
    this.loggingService.log(
      requestId,
      `New Logging Service added for unique request ID: ${requestId}`,
    );

    if (!requestIdFiles.has('ownableData.json')) {
      this.loggingService.logError(
        requestId,
        "Invalid package: 'ownableData.json' is missing",
      );
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
      if (!(jsonFile.NFT_BLOCKCHAIN === 'base')) {
        this.loggingService.logError(
          requestId,
          `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`,
        );
        throw new Error(
          `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`,
        );
      }
    } else {
      jsonFile.NFT_BLOCKCHAIN = 'noNFT';
    }

    let templateId: number;
    let templateModified = false;

    console.log('externalTemplateId', externalTemplateId);

    if (externalTemplateId !== undefined) {
      // Validate that template exists
      const templatePath = `${this.pathToTemplates}/template${externalTemplateId}`;
      const templateExists =
        await this.fileManagement.directoryExists(templatePath);

      if (!templateExists) {
        this.loggingService.logError(
          requestId,
          `Template with ID ${externalTemplateId} does not exist`,
        );
        throw new Error(
          `Template with ID ${externalTemplateId} does not exist`,
        );
      }

      templateId = externalTemplateId;
      this.loggingService.log(
        requestId,
        `Using external templateId: ${templateId}`,
      );
    } else {
      templateId = this.fileManagement.getTemplateIdNumber(jsonFile, requestId);
      console.log(`[Upload] Template ID: ${templateId}`);
      if (isNaN(templateId)) {
        this.loggingService.logError(requestId, `Template ID is not a number`);
        throw new Error(`Template ID is not a number`);
      }
      const templateExists = await this.checkTemplateExists(templateId);
      if (!templateExists) {
        this.loggingService.logError(
          requestId,
          `Template not found for template ID: ${templateId}`,
        );
        throw new Error(`Template not found for template ID: ${templateId}`);
      }

      this.loggingService.log(
        requestId,
        `Extracted templateId from zip: ${templateId}`,
      );
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
      this.loggingService.log(
        requestId,
        `Signed transaction provided, storing for later broadcast`,
      );
      await this.storeSignedTransaction(
        requestId,
        networkId,
        signedTransaction,
      );
    }

    // Check LTO transaction ID
    let transactionIdData: TransactionIdData;

    // If a transaction ID is provided in the JSON, verify it
    if (jsonFile.OWNABLE_LTO_TRANSACTION_ID) {
      try {
        await this.wait(10000);
        const chain = signedTransaction ? 'base' : jsonFile.NFT_BLOCKCHAIN;
        transactionIdData = await this.checkLtoTransactionId(
          networkId,
          jsonFile.OWNABLE_LTO_TRANSACTION_ID,
          templateId,
          chain,
          requestId,
          false,
        );
        this.loggingService.log(
          requestId,
          `transactionIdData:` + JSON.stringify(transactionIdData),
        );

        // Verify signer
        if (
          signerAccountAddress.toLowerCase() !==
          transactionIdData.sender.toLowerCase()
        ) {
          throw new UserError(
            `Error: Signer of Ownable request ${signerAccountAddress} did not sign transactionID ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}. Signer of TXID:${transactionIdData.sender}`,
          );
        }
      } catch (err) {
        this.loggingService.logError(requestId, `${err}`);
        throw new Error(err);
      }
    }
    // If no transaction ID in JSON but signed transaction provided, we'll validate after broadcasting in the store function
    else if (signedTransaction) {
      this.loggingService.log(
        requestId,
        `No transaction ID in JSON, will validate after broadcasting during Ownable creation`,
      );
      // Use the signed transaction's sender as the transaction data since we haven't broadcast yet
      transactionIdData = {
        type: 4, // Transfer type
        sender: signerAccountAddress,
        recipient: this.getLTOAccountAddress(networkId),
        amount: 0, // We don't know this yet as we haven't broadcast
      };
    }
    // Neither transaction ID nor signed transaction provided
    else {
      this.loggingService.logError(
        requestId,
        `No transaction ID in JSON and no signed transaction provided`,
      );
      throw new Error(`Missing transaction ID and signed transaction`);
    }

    // Add to queue (ZIP data will be stored to S3 by enqueue method)
    let entry: QueueEntry;
    try {
      const queueEntry: QueueEntry = {
        requestId: requestId,
        networkId: networkId,
        status: OwnableStatus.Pending,
        templateId: templateId.toString(),
        sender: transactionIdData.sender,
        transactionId: jsonFile.OWNABLE_LTO_TRANSACTION_ID || '',
        timestamp: new Date(),
        nftInfo: nftInfo,
        // Set data reference for compatibility
        data: `${requestId}_data`,
        rid: requestId,
        ltoWallet: transactionIdData.sender,
        txId: jsonFile.OWNABLE_LTO_TRANSACTION_ID || '',
      };

      // Pass the ZIP data to enqueue (it will also store to S3 as backup)
      await this.queueService.enqueue(networkId, queueEntry, uint8ArrayData);
      entry = queueEntry;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to add entry to queue: ${error.message}`,
      );
      throw error;
    }

    this.loggingService.log(
      requestId,
      `Added successfully new entry to queue ` + JSON.stringify(entry),
    );

    return entry;
  }

  private async checkForFailedEntries(networkId: 'L' | 'T') {
    const queryProcessingEntry: QueueEntry[] =
      await this.queueService.getQueueEntriesByStatus(OwnableStatus.Processing);
    if (
      Array.isArray(queryProcessingEntry) &&
      queryProcessingEntry.length > 0
    ) {
      const firstEntry = queryProcessingEntry[0];
      const entryRequestId = firstEntry.requestId || firstEntry.rid;
      if (entryRequestId && entryRequestId !== '') {
        this.loggingService.log(
          entryRequestId,
          `First Entry: ` + JSON.stringify(firstEntry),
        );
      }

      const timestampNow = Math.floor(Date.now() / 1000);
      if (
        entryRequestId &&
        entryRequestId !== '' &&
        !this.queueService.canProcessNewEntry() &&
        firstEntry.timestampProcessing > 0 &&
        timestampNow - queryProcessingEntry[0].timestampProcessing >= 300
      ) {
        this.loggingService.log(
          entryRequestId,
          `Something went wrong with processing Queue Entry. Failed to produce Ownable ` +
            JSON.stringify(queryProcessingEntry[0]),
        );
        await this.queueService.ownableFailed(
          networkId,
          entryRequestId,
          'More than 300 seconds inactive in Processing Queue',
        );
      }
    }
  }
  private async checkQueueStatus() {
    // this.checkForFailedEntries('L');
    // this.checkForFailedEntries('T');

    const isEmpty = await this.queueService.isQueueEmpty();

    if (!isEmpty) {
      try {
        const relayURL = this.relayService.getRelayUrl();
        const isUp: boolean = await this.relayService.isRelayUp(relayURL);

        if (isUp) {
          const canProcess = await this.queueService.canProcessNewEntry();

          if (canProcess) {
            await this.wait(10000);
            let networkId,
              requestId,
              data,
              sender,
              reenqueued_NFTURI,
              reenqueued_NFTINFO,
              reenqueued = false;
            try {
              [
                networkId,
                requestId,
                data,
                sender,
                reenqueued,
                reenqueued_NFTURI,
                reenqueued_NFTINFO,
              ] = await this.queueService.processNextQueueEntry();
            } catch (err) {
              this.loggingService.logError(
                requestId,
                `processNextQueueEntry failed on lto network ${networkId}: ${err}`,
              );
            }

            if (requestId != null && data != null) {
              console.log(
                `[Queue Process] Processing request: ${requestId}, Network: ${networkId}, Sender: ${sender}`,
              );
              try {
                await this.store(
                  networkId,
                  requestId,
                  data,
                  sender,
                  reenqueued,
                  reenqueued_NFTURI,
                  reenqueued_NFTINFO,
                );
                console.log(`[Queue Process] Completed request: ${requestId}`);
              } catch (err) {
                const queryProcessingEntry1: QueueEntry[] =
                  await this.queueService.getQueueEntriesByStatus(
                    OwnableStatus.Processing,
                  );
                if (queryProcessingEntry1 && queryProcessingEntry1.length > 0) {
                  const entryRequestId =
                    queryProcessingEntry1[0].requestId ||
                    queryProcessingEntry1[0].rid ||
                    requestId ||
                    'unknown';
                  this.loggingService.log(
                    entryRequestId,
                    `Ownable creation failed on lto network ${networkId}: ${err}`,
                  );
                  try {
                    await this.queueService.ownableFailed(
                      networkId,
                      entryRequestId,
                      `${err}`,
                    );
                  } catch (e) {
                    this.loggingService.log(
                      entryRequestId,
                      `Setting Ownable Failed failed on lto network ${networkId}: ${e}`,
                    );
                    throw e;
                  }
                } else {
                  const logId = requestId || 'unknown';
                  this.loggingService.log(
                    logId,
                    `Ownable creation failed on lto network ${networkId}, but no processing entries found: ${err}`,
                  );
                }
              }
            }
          }
        } else {
          throw new Error(`Error: oRelay Server ${relayURL} is down`);
        }
      } catch (err) {
        throw err;
      }
    }
  }

  public async getInQueueEntries(networkId: 'L' | 'T'): Promise<QueueEntry[]> {
    return await this.queueService.getQueueEntriesByStatus(
      OwnableStatus.InQueue,
    );
  }
  public async getProcessingEntries(
    networkId: 'L' | 'T',
  ): Promise<QueueEntry[]> {
    return await this.queueService.getQueueEntriesByStatus(
      OwnableStatus.Processing,
    );
  }
  public async getReadyEntries(networkId: 'L' | 'T'): Promise<QueueEntry[]> {
    return await this.queueService.getQueueEntriesByStatus(OwnableStatus.Ready);
  }
  public async getSentEntries(networkId: 'L' | 'T'): Promise<QueueEntry[]> {
    return await this.queueService.getQueueEntriesByStatus(OwnableStatus.Sent);
  }
  public async getQueueEntriesByRequestId(
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<QueueEntry[]> {
    // This would need to be implemented in RedisQueueService
    return [];
  }
  public async getQueueEntriesByWallet(wallet: string): Promise<QueueEntry[]> {
    // This would need to be implemented in RedisQueueService
    return [];
  }
  public async getQueueEntriesByStatus(
    networkId: 'L' | 'T',
    status: OwnableStatus,
  ): Promise<QueueEntry[]> {
    return await this.queueService.getQueueEntriesByStatus(status);
  }

  public async queueStatus(): Promise<any> {
    let isOwnableBeingBuild: string = '';
    // let isQueueingAllowed: boolean = true;
    let currentlyProcessedQueueEntry: QueueEntry[] = [];

    const defaultQueueEntry: QueueEntry = {
      requestId: '',
      networkId: 'L',
      status: OwnableStatus.Unknown,
      templateId: '0',
      sender: '',
      transactionId: '',
      timestamp: new Date(),
      nftInfo: {
        network: '',
        address: '',
        id: 0,
      },
    };
    const networkId = await this.queueService.isCreatingOwnable();
    if (networkId === 'L' || networkId === 'T') {
      isOwnableBeingBuild = networkId;

      currentlyProcessedQueueEntry =
        await this.queueService.getQueueEntriesByStatus(
          OwnableStatus.Processing,
        );
    } else {
      currentlyProcessedQueueEntry.push(defaultQueueEntry);
    }
    // const timeElapsed = this.queueBusyTimer * 10; // queueBusytimer is increased each 10 seconds by one

    const entryRequestId =
      currentlyProcessedQueueEntry[0].requestId ||
      currentlyProcessedQueueEntry[0].rid ||
      'unknown';
    return {
      creatingOwnable: isOwnableBeingBuild,
      requestId: entryRequestId.toString(),
      ltoWallet: (
        currentlyProcessedQueueEntry[0].ltoWallet ||
        currentlyProcessedQueueEntry[0].sender ||
        ''
      ).toString(),
      hash: (currentlyProcessedQueueEntry[0].hash || '').toString(),
      txId: (
        currentlyProcessedQueueEntry[0].txId ||
        currentlyProcessedQueueEntry[0].transactionId ||
        ''
      ).toString(),
      ownableStatus: currentlyProcessedQueueEntry[0].ownableStatus,
      templateId: (currentlyProcessedQueueEntry[0].templateId || '').toString(),
      timestampInQueue: (
        currentlyProcessedQueueEntry[0].timestampInQueue || 0
      ).toString(),
      timestampProcessing: (
        currentlyProcessedQueueEntry[0].timestampProcessing || 0
      ).toString(),
      timestampSent: (
        currentlyProcessedQueueEntry[0].timestampSent || 0
      ).toString(),
      timestampFailed: (
        currentlyProcessedQueueEntry[0].timestampFailed || 0
      ).toString(),
    };
  }
  private wait = (n: number) =>
    new Promise((resolve) => setTimeout(resolve, n));

  public async store(
    networkId: 'L' | 'T',
    requestId: string,
    data: Uint8Array,
    sender: string,
    reenqueued: boolean,
    reenqueued_NFTURI: string,
    reenqueued_NFTINFO: NftInfo,
  ) {
    // Get and save local reference to queue entry
    let queueEntry: QueueEntry | null = null;
    let queueIndex: number = -1;

    try {
      [queueEntry, queueIndex] =
        await this.queueService.getQueueEntryByRequestId(networkId, requestId);

      if (!queueEntry || queueIndex === -1) {
        this.loggingService.logError(
          requestId,
          `Queue entry not found at beginning of processing`,
        );
        throw new Error('Queue entry not found');
      }

      this.loggingService.log(
        requestId,
        `Unzipping user input files for Ownable creation into memory`,
      );
      const requestIdFiles = await this.fileManagement.unzip(data);

      if (!requestIdFiles.has('ownableData.json')) {
        this.loggingService.logError(
          requestId,
          `Invalid package: 'ownableData.json' is missing in requestId: ${requestId}`,
        );
        throw new Error("Invalid package: 'ownableData.json' is missing");
      }

      const jsonFile = await this.readOwnableDataFromZip(requestIdFiles);
      this.loggingService.log(
        requestId,
        `jsonFile: ${JSON.stringify(jsonFile)}`,
      );

      // Sanitize package name if needed
      if (this.fileManagement.isValidPackageName(jsonFile.PLACEHOLDER1_NAME)) {
        this.loggingService.log(
          requestId,
          `Valid package PLACEHOLDER1_NAME. ${jsonFile.PLACEHOLDER1_NAME}`,
        );
      } else {
        this.loggingService.log(
          requestId,
          `Sanitizing invalid characters in PLACEHOLDER1_NAME: ${jsonFile.PLACEHOLDER1_NAME}`,
        );
        const sanitized_PLACEHOLDER1_NAME =
          this.fileManagement.sanitizePackageName(
            jsonFile.PLACEHOLDER1_NAME,
            false,
          );
        const sanitized_PLACEHOLDER2_IMG =
          this.fileManagement.sanitizePackageName(
            jsonFile.PLACEHOLDER2_IMG,
            true,
          );

        // Update file references
        if (requestIdFiles.has(jsonFile.PLACEHOLDER2_IMG)) {
          const bufferValue = requestIdFiles.get(jsonFile.PLACEHOLDER2_IMG);
          if (jsonFile.PLACEHOLDER2_IMG !== sanitized_PLACEHOLDER2_IMG) {
            requestIdFiles.set(sanitized_PLACEHOLDER2_IMG, bufferValue);
            requestIdFiles.delete(jsonFile.PLACEHOLDER2_IMG);
          }
        }

        this.loggingService.log(
          requestId,
          `OLD: ${jsonFile.PLACEHOLDER1_NAME}  NEW: ${sanitized_PLACEHOLDER1_NAME}`,
        );
        this.loggingService.log(
          requestId,
          `OLD: ${jsonFile.PLACEHOLDER2_IMG}  NEW: ${sanitized_PLACEHOLDER2_IMG}`,
        );
        jsonFile.PLACEHOLDER1_NAME = sanitized_PLACEHOLDER1_NAME;
        jsonFile.PLACEHOLDER2_IMG = sanitized_PLACEHOLDER2_IMG;
      }

      // Validate blockchain settings
      if (jsonFile.CREATE_NFT === 'true') {
        if (!(jsonFile.NFT_BLOCKCHAIN === 'base')) {
          this.loggingService.logError(
            requestId,
            `Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`,
          );
          throw new Error(
            `Error: Unsupported network: ${jsonFile.NFT_BLOCKCHAIN}`,
          );
        }
      } else {
        jsonFile.NFT_BLOCKCHAIN = 'noNFT';
      }

      // Get templateId from queue entry
      let templateId: number;
      //   let templateModified = false;

      if (queueEntry && queueEntry.templateId !== undefined) {
        // Use templateId from queue entry
        templateId = parseInt(queueEntry.templateId);
        this.loggingService.log(
          requestId,
          `Using templateId from queue entry: ${templateId}`,
        );
      } else {
        // Fallback to extracting from JSON
        templateId = this.fileManagement.getTemplateIdNumber(
          jsonFile,
          requestId,
        );
        this.loggingService.log(
          requestId,
          `Extracted templateId from JSON: ${templateId}`,
        );
      }

      // Update JSON if needed
      // if (templateModified) {
      //   const updatedJsonBuffer = Buffer.from(JSON.stringify(jsonFile));
      //   requestIdFiles.set('ownableData.json', updatedJsonBuffer);
      // }

      // Validate transaction ID if already present in JSON (pre-existing transaction)
      let transactionIdData: TransactionIdData;
      let usedExistingTransaction = false;

      if (
        jsonFile.OWNABLE_LTO_TRANSACTION_ID &&
        !this.signedTransactions.has(requestId)
      ) {
        this.loggingService.log(
          requestId,
          `Validating existing transaction ID: ${jsonFile.OWNABLE_LTO_TRANSACTION_ID}`,
        );

        try {
          transactionIdData = await this.checkLtoTransactionId(
            networkId,
            jsonFile.OWNABLE_LTO_TRANSACTION_ID,
            templateId,
            'base',
            requestId,
            reenqueued,
          );
          usedExistingTransaction = true;
          this.loggingService.log(
            requestId,
            `Existing transaction validated: ${JSON.stringify(transactionIdData)}`,
          );
        } catch (err) {
          this.loggingService.logError(
            requestId,
            `Error validating existing transaction: ${err}`,
          );
          throw err;
        }
      }

      // Create NFT first if needed
      let nftInfo: NftInfo;

      if (jsonFile.CREATE_NFT === 'true') {
        const picture: Buffer = requestIdFiles.get(
          `${jsonFile.PLACEHOLDER2_IMG}`,
        );
        this.loggingService.log(
          requestId,
          `Creating S3 image File for NFT Token URI...`,
        );

        try {
          if (!reenqueued || reenqueued_NFTURI === '') {
            jsonFile.NFT_TOKEN_URI = await this.createPinataPinnedFile(
              picture,
              jsonFile.PLACEHOLDER1_NAME,
              jsonFile.PLACEHOLDER1_DESCRIPTION,
            );
          } else {
            jsonFile.NFT_TOKEN_URI = reenqueued_NFTURI;
          }
        } catch (err) {
          this.loggingService.logError(
            requestId,
            `Creating S3 image File failed: ${err}`,
          );
          throw err;
        }

        this.loggingService.log(
          requestId,
          `NFT Token URI: ${jsonFile.NFT_TOKEN_URI}`,
        );

        try {
          if (!reenqueued) {
            nftInfo = await this.nft.mintNewNft(networkId, jsonFile, requestId);
          } else {
            nftInfo = reenqueued_NFTINFO;
          }
        } catch (err) {
          this.loggingService.logError(requestId, `Minting NFT failed: ${err}`);
          throw err;
        }

        jsonFile.PLACEHOLDER1_KEYWORDS.push('hasNFT');
      } else {
        nftInfo = {
          network: '',
          address: '',
          id: 0,
        };
        jsonFile.PLACEHOLDER1_KEYWORDS.push('noNFT');
      }

      try {
        // Step 2: Create the Ownable
        console.log(
          `[Build] Starting Ownable build - Request: ${requestId}, Template: ${queueEntry.templateId}, Sender: ${sender}`,
        );
        this.loggingService.log(
          requestId,
          `Creating Ownable for request ID ${requestId}...`,
        );

        // Build the Ownable first but don't send it yet
        const ownableData = await this.buildOwnable(
          networkId,
          requestId,
          jsonFile,
          nftInfo,
          sender,
          requestIdFiles,
          parseInt(queueEntry.templateId),
        );
        console.log(`[Build] Ownable built - CID: ${ownableData.cid}`);

        // Step 3: Process payment transaction just before sending
        if (this.signedTransactions && this.signedTransactions.has(requestId)) {
          this.loggingService.log(
            requestId,
            `Found signed transaction for request ID: ${requestId}`,
          );

          const storedTx = this.signedTransactions.get(requestId);

          // Verify network matches
          if (storedTx.networkId !== networkId) {
            this.loggingService.logError(
              requestId,
              `Transaction network (${storedTx.networkId}) doesn't match ownable network (${networkId})`,
            );
            throw new Error('Transaction network mismatch');
          }

          // Now broadcast the transaction
          this.loggingService.log(
            requestId,
            `Broadcasting payment transaction before sending ownable...`,
          );
          const txResult = await this.broadcastTransaction(
            networkId,
            storedTx.transaction,
            requestId,
          );
          this.loggingService.log(
            requestId,
            `Transaction broadcast successful with ID: ${txResult.id}`,
          );

          // Now validate the transaction
          try {
            this.loggingService.log(
              requestId,
              `store: Validating newly broadcast transaction: ${txResult.id}`,
            );

            // Wait for transaction to be confirmed
            this.loggingService.log(
              requestId,
              `store: Waiting for transaction confirmation (10 seconds)...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 10000));

            transactionIdData = await this.checkLtoTransactionId(
              networkId,
              txResult.hash,
              templateId,
              'base',
              requestId,
              false,
            );
            // Remove stored transaction
            this.signedTransactions.delete(requestId);

            this.loggingService.log(
              requestId,
              `store: Transaction validation successful: ${JSON.stringify(transactionIdData)}`,
            );
          } catch (err) {
            this.loggingService.logError(
              requestId,
              `store: Transaction validation failed: ${err}`,
            );
            throw new Error(
              `Payment transaction validation failed: ${err.message}`,
            );
          }

          // Update queue entry with transaction ID
          const [entry, index] =
            await this.queueService.getQueueEntryByRequestId(
              networkId,
              requestId,
            );
          console.log('store1: entry', entry);
          console.log('store1: index', index);

          if (entry && index !== -1) {
            entry.paymentTransactionId = txResult.hash;
            // If transaction wasn't in the original JSON, update that too
            if (!jsonFile.OWNABLE_LTO_TRANSACTION_ID) {
              entry.txId = txResult.hash;
            }

            if (networkId === 'L') {
              this.queueService.queueMainnet[index] = entry;
            } else {
              this.queueService.queueTestnet[index] = entry;
            }
            await this.queueService.updateQueueInS3Bucket(networkId);

            console.log('store: queueTestnet', this.queueService.queueTestnet);
          }

          // Remove the stored transaction
          this.signedTransactions.delete(requestId);

          this.loggingService.log(
            requestId,
            `Payment transaction processed successfully`,
          );
        } else if (!usedExistingTransaction) {
          this.loggingService.logError(
            requestId,
            `No payment transaction found for request ID: ${requestId}`,
          );
          throw new Error(`No payment transaction found`);
        }
        // Update queue status to Ready
        await this.queueService.setQueueEntryStatus(
          networkId,
          requestId,
          OwnableStatus.Ready,
        );
        // Step 4: Send the Ownable
        console.log(
          `[Transfer] Sending Ownable - Request: ${requestId}, Network: ${networkId}, To: ${sender}`,
        );
        this.loggingService.log(requestId, `Sending Ownable...`);
        const hash = await this.sendOwnable(
          networkId,
          requestId,
          sender,
          ownableData.zipContent,
        );

        // Update status in S3
        if (ownableData.cid) {
          await this.queueService.setQueueEntryStatus(
            networkId,
            requestId,
            OwnableStatus.Sent,
          );
        }

        console.log(
          `[Transfer] Ownable sent - Request: ${requestId}, Hash: ${hash}`,
        );
        this.loggingService.log(
          requestId,
          `Ownable sent successfully with hash: ${hash}`,
        );
        return hash;
      } catch (err) {
        this.loggingService.logError(
          requestId,
          `Ownable creation or sending failed: ${err}`,
        );
        throw err;
      }
    } catch (err) {
      throw err;
    }
  }

  // New helper method to build the Ownable without sending it
  private async buildOwnable(
    networkId: 'L' | 'T',
    requestId: string,
    jsonFile: any,
    nftInfo: NftInfo,
    sender: string,
    requestIdFiles: Map<string, Buffer>,
    templateId: number,
  ): Promise<{ zipContent: Uint8Array; cid: string }> {
    // This method extracts the Ownable creation logic from startOwnableCreation
    // but doesn't perform the final send

    this.loggingService.log(requestId, `Building Ownable...`);
    this.loggingService.log(
      requestId,
      `Copying template${templateId} to template directory for modification`,
    );

    let cpCmdFrom = `${this.pathToTemplates}/template${templateId}`;
    let cpCmdTo = `ownables/${jsonFile.PLACEHOLDER1_NAME}`;

    // Declare thumbnail and thumbnailBuffer at function scope so they're accessible throughout
    let thumbnail: Buffer | undefined;
    let thumbnailBuffer: Buffer | undefined;

    try {
      await this.fileManagement.copyDirectory(cpCmdFrom, cpCmdTo, requestId);

      // Copy image files
      const image = requestIdFiles.get(`${jsonFile.PLACEHOLDER2_IMG}`);
      if (!image) {
        this.loggingService.logError(
          requestId,
          `Image file not found: ${jsonFile.PLACEHOLDER2_IMG}`,
        );
        throw new Error(
          `Image file not found in upload: ${jsonFile.PLACEHOLDER2_IMG}`,
        );
      }
      let filePath = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/${jsonFile.PLACEHOLDER2_IMG}`;
      await this.fileManagement.writeFile(filePath, image, requestId);

      // Thumbnail naming convention: must be 'thumbnail.webp' in the final package
      // Check if thumbnail.webp exists in uploaded files first
      thumbnail = requestIdFiles.get('thumbnail.webp');

      // If not found, check if OWNABLE_THUMBNAIL specifies a different file
      if (!thumbnail && jsonFile.OWNABLE_THUMBNAIL) {
        thumbnail = requestIdFiles.get(`${jsonFile.OWNABLE_THUMBNAIL}`);
        if (thumbnail) {
          this.loggingService.log(
            requestId,
            `Found thumbnail file: ${jsonFile.OWNABLE_THUMBNAIL}, will convert to thumbnail.webp`,
          );
        }
      }

      // If thumbnail still not found, create it from main image
      if (!thumbnail) {
        this.loggingService.log(
          requestId,
          `Thumbnail not provided, creating thumbnail.webp from main image`,
        );
        // Create thumbnail from main image (will be saved as thumbnail.webp below)
        thumbnail = image;
      }

      // Always write thumbnail as 'thumbnail.webp' (required naming convention)
      // Create resized webp version from the thumbnail/image
      try {
        // Always resize to 50x50 and convert to webp (as per spec)
        thumbnailBuffer = await sharp(thumbnail)
          .resize(50, 50)
          .webp({ quality: 80 })
          .toBuffer();

        if (thumbnailBuffer.length > 256 * 1024) {
          this.loggingService.logError(
            requestId,
            `Thumbnail exceeds 256KB (${thumbnailBuffer.length} bytes), trying lower quality`,
          );
          // Try with lower quality
          thumbnailBuffer = await sharp(thumbnail)
            .resize(50, 50)
            .webp({ quality: 60 })
            .toBuffer();

          if (thumbnailBuffer.length > 256 * 1024) {
            this.loggingService.logError(
              requestId,
              `Thumbnail still exceeds 256KB after quality reduction, using smaller size`,
            );
            // Try smaller size
            thumbnailBuffer = await sharp(thumbnail)
              .resize(40, 40)
              .webp({ quality: 60 })
              .toBuffer();
          }
        }
      } catch (err) {
        this.loggingService.logError(
          requestId,
          `Failed to create thumbnail.webp: ${err.message}, using original image`,
        );
        thumbnailBuffer = thumbnail;
      }

      if (!thumbnailBuffer) {
        this.loggingService.logError(
          requestId,
          `thumbnailBuffer is undefined, falling back to image`,
        );
        thumbnailBuffer = image;
      }

      filePath = `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/thumbnail.webp`;
      await this.fileManagement.writeFile(filePath, thumbnailBuffer, requestId);
      this.loggingService.log(
        requestId,
        `Thumbnail written as thumbnail.webp (${thumbnailBuffer.length} bytes)`,
      );

      // Update thumbnail variable for metadata use
      thumbnail = thumbnailBuffer;

      // Set default author if missing
      if (typeof jsonFile.PLACEHOLDER1_AUTHORS === 'undefined')
        jsonFile.PLACEHOLDER1_AUTHORS = '';

      // Replace placeholders
      await this.fileManagement.batchReplaceInFile(
        '',
        [
          // ... existing replacements (unchanged)
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
            searchValue: 'PLACEHOLDER1_NAME',
            replacement: `"${jsonFile.PLACEHOLDER1_NAME}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
            searchValue: 'PLACEHOLDER1_DESCRIPTION',
            replacement: `"${jsonFile.PLACEHOLDER1_DESCRIPTION}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
            searchValue: 'PLACEHOLDER1_VERSION',
            replacement: `"${jsonFile.PLACEHOLDER1_VERSION}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
            searchValue: 'PLACEHOLDER1_AUTHORS',
            replacement: `"${jsonFile.PLACEHOLDER1_AUTHORS}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/Cargo.toml`,
            searchValue: 'PLACEHOLDER1_KEYWORDS',
            replacement: arrayToString(jsonFile.PLACEHOLDER1_KEYWORDS),
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`,
            searchValue: 'PLACEHOLDER2_TITLE',
            replacement: `${jsonFile.PLACEHOLDER2_TITLE}`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/assets/index.html`,
            searchValue: 'PLACEHOLDER2_IMG',
            replacement: `"${jsonFile.PLACEHOLDER2_IMG}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`,
            searchValue: 'PLACEHOLDER3_MSG',
            replacement: `${jsonFile.PLACEHOLDER1_NAME}`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/examples/schema.rs`,
            searchValue: 'PLACEHOLDER3_STATE',
            replacement: `${jsonFile.PLACEHOLDER1_NAME}`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
            searchValue: 'PLACEHOLDER4_CONTRACT_NAME',
            replacement: `"crates.io:${jsonFile.PLACEHOLDER1_NAME}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
            searchValue: 'PLACEHOLDER4_TYPE',
            replacement: `"${jsonFile.PLACEHOLDER4_TYPE}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
            searchValue: 'PLACEHOLDER4_DESCRIPTION',
            replacement: `"${jsonFile.PLACEHOLDER4_DESCRIPTION}"`,
          },
          {
            filePath: `ownables/${jsonFile.PLACEHOLDER1_NAME}/src/contract.rs`,
            searchValue: 'PLACEHOLDER4_NAME',
            replacement: `"${jsonFile.PLACEHOLDER4_NAME}"`,
          },
        ],
        requestId,
      );
      // Check dependencies
      await this.fileManagement.executeCommandWithLogging(
        'cargo --version',
        requestId,
      );
      await this.fileManagement.executeCommandWithLogging(
        'rustup --version',
        requestId,
      );
      await this.fileManagement.executeCommandWithLogging(
        'wasm-pack --version',
        requestId,
      );

      // Build the ownable
      this.loggingService.log(requestId, `Building Ownable...`);
      await this.fileManagement.executeCommandWithNetworkLogging(
        networkId,
        `npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`,
        requestId,
        {
          env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` },
        },
        this.queueService,
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
          this.loggingService.log(
            requestId,
            `Updated package.json content: ${JSON.stringify(packageJson, null, 2)}`,
          );

          // Convert back to Buffer and update in pkgFiles
          const updatedPackageJson = Buffer.from(
            JSON.stringify(packageJson, null, 2),
          );
          pkgFiles.set('package.json', updatedPackageJson);

          this.loggingService.log(
            requestId,
            `Updated package.json name to: ${jsonFile.PLACEHOLDER4_NAME}`,
          );
        } catch (err) {
          this.loggingService.logError(
            requestId,
            `Failed to update package.json: ${err.message}`,
          );
          throw err;
        }
      }
      // Generate unique CID
      const cid = await this.fileManagement.getUniqueId(pkgFiles);
      this.loggingService.log(requestId, `Generated CID: ${cid}`);

      // Store NFT info
      await this.queueService.setCidNftInfo(
        networkId,
        requestId,
        cid,
        nftInfo,
        jsonFile.NFT_TOKEN_URI,
      );

      // Prepare the files for storing
      const ownableZip = `${this.pathToCids}/${cid}/${cid}.zip`;
      await this.fileManagement.copyFile(zipFile, ownableZip);
      await this.fileManagement.deleteFile(zipFile);
      await this.fileManagement.cleanupDirectory(
        `ownables/${jsonFile.PLACEHOLDER1_NAME}`,
      );

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
        keywords: jsonFile.PLACEHOLDER1_KEYWORDS,
      };

      // Create event chain
      const chainString = await this.createEventChain(
        pkgOwnable,
        nftInfo,
        sender,
      );
      const chainBuffer = Buffer.from(chainString, 'utf8');
      pkgFiles.set('chain.json', chainBuffer);

      // Store files
      await this.fileManagement.storeFiles(
        `${this.pathToCids}/${cid}`,
        cid,
        pkgFiles,
      );

      // Create final zip with chain
      const zipFile_buffer = await this.fileManagement.readFile(
        `${this.pathToCids}/${cid}/${cid}.zip`,
      );
      const new_zip = new JSZip();
      await new_zip.loadAsync(zipFile_buffer);

      const eventChainJsonFile = await this.fileManagement.readFile(
        `${this.pathToCids}/${cid}/${cid}.json`,
      );
      new_zip.file('chain.json', eventChainJsonFile);
      new_zip.file('timestamp.txt', Buffer.from(timeMillisecondsNow, 'utf-8'));

      const zipContent = await new_zip.generateAsync({ type: 'uint8array' });

      //Initialize the metadata component
      this.ownableMeta.title = pkgOwnable.title || 'Ownable';
      this.ownableMeta.description = pkgOwnable.description || '';
      // Use the already-resized thumbnail.webp for metadata (convert to Binary for eqty-core)
      if (thumbnailBuffer) {
        this.ownableMeta.thumbnail = Binary.from(thumbnailBuffer);
        this.loggingService.log(
          requestId,
          `Metadata thumbnail set from thumbnail.webp (${thumbnailBuffer.length} bytes)`,
        );
      } else {
        this.loggingService.logError(
          requestId,
          'No thumbnail available for metadata thumbnail',
        );
        this.ownableMeta.thumbnail = null;
      }

      // Store in S3
      await this.s3.storeZip(networkId, cid, requestId, sender, zipContent);

      return { zipContent, cid };
    } catch (err) {
      this.loggingService.logError(
        requestId,
        `Failed to build Ownable: ${err.message}`,
      );

      // Cleanup
      try {
        await this.fileManagement.executeCommandWithLogging(
          `rm -rf ownables/${jsonFile.PLACEHOLDER1_NAME}`,
          requestId,
        );
      } catch (cleanupErr) {
        this.loggingService.logError(
          requestId,
          `Cleanup failed: ${cleanupErr.message}`,
        );
      }

      throw err;
    }
  }

  /**
   * Retrieves the ownable content for a given request ID
   * @param networkId Network identifier ('L' for mainnet, 'T' for testnet)
   * @param requestId Request ID for the ownable
   * @returns The ownable file content as Uint8Array
   */
  public async getOwnableContent(
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<Uint8Array> {
    try {
      // Get the queue entry to find the CID
      const [entry, _] = await this.queueService.getQueueEntryByRequestId(
        networkId,
        requestId,
      );

      if (!entry || !entry.cid) {
        this.loggingService.logError(
          requestId,
          `Cannot find ownable content for requestId: ${requestId}. Missing entry or CID.`,
        );
        throw new Error(
          `Cannot find ownable content for requestId: ${requestId}. Missing entry or CID.`,
        );
      }

      // Get the content from S3
      const zipContent = await this.s3.getZip(
        networkId,
        entry.cid,
        requestId,
        entry.ltoWallet,
      );

      if (!zipContent) {
        this.loggingService.logError(
          requestId,
          `Failed to retrieve ownable content from storage for requestId: ${requestId}`,
        );
        throw new Error(
          `Failed to retrieve ownable content from storage for requestId: ${requestId}`,
        );
      }

      return zipContent;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Error getting ownable content: ${error.message}`,
      );

      // Check if this is a queue-related error
      if (error.message.includes('Missing entry or CID')) {
        // Try to update queue entry status if possible to avoid further attempts
        try {
          await this.queueService.ownableFailed(
            networkId,
            requestId,
            error.message,
          );
        } catch (queueErr) {
          this.loggingService.logError(
            requestId,
            `Failed to update queue status: ${queueErr.message}`,
          );
        }
      }

      throw error;
    }
  }

  // private async watchFileCreation(networkId: 'L' | 'T', zipFile1: string, jsonFile: any, nftInfo: NftInfo, sender: string, rid: string) {
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
  // 		await this.queueService.setCidNftInfo(networkId, rid, cid, nftInfo, jsonFile.NFT_TOKEN_URI);
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
  // 		const [preEntry, preIndex] = this.queueService.getQueueEntryByRequestId(networkId, rid);
  // 		this.loggingService.log(rid, `PRE-READY: Entry exists: ${!!preEntry}, index: ${preIndex}`);

  // 		await this.queueService.setQueueEntryStatus(networkId, rid, OwnableStatus.Ready);
  // 		this.loggingService.log(rid, `Setting Queue entry status to Ready for ${rid}`);

  // 		// Get a snapshot of the queue entry after setting to Ready
  // 		const [readyEntry, readyIndex] = this.queueService.getQueueEntryByRequestId(networkId, rid);
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
  // 		await this.s3.storeZip(networkId, cid, rid, sender, zipContent);
  // 		this.loggingService.log(rid, `Stored successfully ${cid}_${rid}_${sender}_.zip on s3 Bucket`);
  // 	} catch (err) {
  // 		this.loggingService.logError(rid, `Failed to store ${cid}_${rid}_${sender}_.zip on s3 Bucket: ${err}`);
  // 		throw err;
  // 	}

  // 	try {

  // 		// Send the file first
  // 		this.loggingService.log(rid, `Sending Ownable.. networkId:${networkId} rid:${rid} sender:${sender}`);
  // 		const hash = await this.sendOwnable(networkId, rid, sender, zipContent);

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

  public async resendOwnableByRequestId(
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<any> {
    let files: string[];
    if (networkId === 'L') {
      files = await this.s3.s3BucketOwnables_L.list();
    } else {
      files = await this.s3.s3BucketOwnables_T.list();
    }
    console.log('Bucket files:', files);

    // Build the regex pattern
    const myReg = new RegExp(`^${requestId}_`, 'g');
    console.log('Regex pattern:', myReg);
    const matchingFile = files.find((file) => file.match(myReg));

    const retVal = {
      networkId: networkId,
      requestId: requestId,
      cid: '',
      sender: '',
      resend: false,
    };

    if (matchingFile) {
      const filesArray = matchingFile.split('_');
      console.log('Matching file array:', filesArray);

      retVal.cid = filesArray[1]; // cid
      retVal.sender = filesArray[2];
      let zipContent: Buffer;

      if (networkId === 'L') {
        zipContent = await this.s3.s3BucketOwnables_L.get(
          `${requestId}_${retVal.cid}_${retVal.sender}_.zip`,
        );
      } else {
        zipContent = await this.s3.s3BucketOwnables_T.get(
          `${requestId}_${retVal.cid}_${retVal.sender}_.zip`,
        );
      }

      try {
        await this.sendOwnable(networkId, requestId, retVal.sender, zipContent);
        retVal.resend = true;
      } catch (err) {
        retVal.resend = false;
        this.loggingService.logError(
          requestId,
          `Failed to re-send Ownable RID:${requestId} SENDER:${retVal.sender}: ${err}`,
        );
        throw err;
      }

      return JSON.parse(JSON.stringify(retVal));
    }
  }

  // private async startOwnableCreation(networkId: 'L' | 'T', rid: string, jsonFile: any, nftInfo: NftInfo, sender: string, requestIdFiles: Map<string, Buffer>): Promise<string> {
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
  // 			networkId,
  // 			`npm run ownables:build --package=${jsonFile.PLACEHOLDER1_NAME}`,
  // 			rid,
  // 			{ env: { ...process.env, PATH: `${process.env.PATH}:/root/.cargo/bin` } },
  // 			this.queueService
  // 		);

  // 		Watch for zip file creation
  // 		const zipFileToWatch = `ownables/${jsonFile.PLACEHOLDER1_NAME}.zip`;
  // 		this.loggingService.log(rid, `Starting file watcher for zip file: ${zipFileToWatch}`);
  // 		return await this.watchFileCreation(networkId, zipFileToWatch, jsonFile, nftInfo, sender, rid);
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
