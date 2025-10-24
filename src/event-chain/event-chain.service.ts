import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggingService } from '../logging/redis-logging.service';
import { EqtyService } from '../eqty/eqty.service';
import { FileManagementService } from '../file-management/file-management.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { Buffer } from 'buffer';
import * as path from 'path';
import * as fs from 'fs';
import { ethers } from 'ethers';

// Dynamic imports for ES modules
let EventChain: any;
let Event: any;

// Define interfaces for TypedPackage and NftInfo
interface TypedPackage {
  cid: string;
  isDynamic: boolean;
  keywords: string[];
}

interface NftInfo {
  network: string;
  id: number;
  address: string;
}

interface IEventChainJSON {
  id: string;
  events: any[];
  // Other properties as needed
}

@Injectable()
export class EventChainService implements OnModuleInit {
  private pathToCids: string;

  constructor(
    private readonly loggingService: LoggingService,
    private readonly eqtyService: EqtyService,
    private readonly fileManagement: FileManagementService,
    private readonly telegramService: TelegramBotService,
  ) {
    // Set the path from configuration or default
    this.pathToCids = process.env.OWNABLE_CID_PATH || './storage/ownable-cids';
  }

  async onModuleInit() {
    // Dynamic import of eqty-core ES module
    try {
      const eqtyCore = await import('eqty-core');
      EventChain = eqtyCore.EventChain;
      Event = eqtyCore.Event;
    } catch (error) {
      console.error('Failed to import eqty-core in EventChainService:', error);
      throw error;
    }
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create directory ${dirPath}: ${error.message}`,
      );
    }
  }

  /**
   * Creates an event chain for an ownable
   * @param userAddress User's wallet address
   * @param networkId Network identifier ('L' for mainnet, 'T' for testnet)
   * @param requestId Request ID for logging
   * @returns Created event chain
   */
  public async createOwnableEventChain(
    userAddress: string,
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<any> {
    try {
      this.loggingService.log(
        requestId,
        `Creating event chain for user: ${userAddress} on network: ${networkId}`,
      );

      // Create event chain using eqty-core
      const eventChain = this.eqtyService.createEventChain(
        networkId,
        userAddress,
      );

      this.loggingService.log(requestId, `Event chain created successfully`);

      return eventChain;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to create event chain: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Adds an event to an event chain
   * @param eventChain The event chain to add the event to
   * @param eventData Data for the event
   * @param mediaType Media type of the event data
   * @param networkId Network identifier
   * @param requestId Request ID for logging
   * @returns Updated event chain
   */
  public async addEventToChain(
    eventChain: any,
    eventData: any,
    mediaType: string = 'application/json',
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<any> {
    try {
      this.loggingService.log(
        requestId,
        `Adding event to chain with media type: ${mediaType}`,
      );

      // Create event using eqty-core
      const event = new Event(eventData, mediaType);

      eventChain.add(event);

      // Sign the event with server wallet
      await this.eqtyService.signEventWithServerWallet(event, networkId);

      this.loggingService.log(requestId, `Event added and signed successfully`);

      return eventChain;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to add event to chain: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Anchors an event chain to Base blockchain
   * @param eventChain The event chain to anchor
   * @param networkId Network identifier
   * @param requestId Request ID for logging
   * @returns Transaction hash
   */
  public async anchorEventChain(
    eventChain: any,
    networkId: 'L' | 'T',
    requestId: string,
  ): Promise<string> {
    try {
      this.loggingService.log(
        requestId,
        `Anchoring event chain to Base ${networkId} network`,
      );

      // Anchor the event chain using eqty-service
      const txHash = await this.eqtyService.anchorEventChain(
        eventChain,
        networkId,
      );

      this.loggingService.log(
        requestId,
        `Event chain anchored successfully with tx hash: ${txHash}`,
      );

      return txHash;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to anchor event chain: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Saves an event chain to storage
   * @param eventChain The event chain to save
   * @param requestId Request ID for logging
   * @returns File path where the chain was saved
   */
  public async saveEventChain(
    eventChain: any,
    requestId: string,
  ): Promise<string> {
    try {
      await this.ensureDirectoryExists(this.pathToCids);

      const chainId = eventChain.id || `chain-${Date.now()}`;
      const fileName = `${chainId}.json`;
      const filePath = path.join(this.pathToCids, fileName);

      // Convert event chain to JSON
      const chainJSON = eventChain.toJSON();

      // Write to file
      await fs.promises.writeFile(filePath, JSON.stringify(chainJSON, null, 2));

      this.loggingService.log(requestId, `Event chain saved to: ${filePath}`);

      return filePath;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to save event chain: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Loads an event chain from storage
   * @param chainId The ID of the chain to load
   * @param requestId Request ID for logging
   * @returns Loaded event chain
   */
  public async loadEventChain(
    chainId: string,
    requestId: string,
  ): Promise<any> {
    try {
      const fileName = `${chainId}.json`;
      const filePath = path.join(this.pathToCids, fileName);

      // Check if file exists
      await fs.promises.access(filePath);

      // Read file content
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const chainJSON: IEventChainJSON = JSON.parse(fileContent);

      // Create event chain from JSON using eqty-core
      const eventChain = EventChain.from(chainJSON);

      this.loggingService.log(
        requestId,
        `Event chain loaded from: ${filePath}`,
      );

      return eventChain;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to load event chain: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Validates an event chain
   * @param eventChain The event chain to validate
   * @param requestId Request ID for logging
   * @returns Validation result
   */
  public async validateEventChain(
    eventChain: any,
    requestId: string,
  ): Promise<boolean> {
    try {
      this.loggingService.log(requestId, `Validating event chain`);

      // Create verification function for eqty-core
      const verifyFn = async (
        address: string,
        domain: any,
        types: any,
        value: any,
        signature: string,
      ) => {
        try {
          // Use ethers to verify the signature
          const recoveredAddress = ethers.verifyTypedData(
            domain,
            types,
            value,
            signature,
          );
          return recoveredAddress.toLowerCase() === address.toLowerCase();
        } catch (error) {
          this.loggingService.logError(
            requestId,
            `Signature verification failed: ${error}`,
          );
          return false;
        }
      };

      // Validate the event chain
      await eventChain.validate(verifyFn);

      this.loggingService.log(requestId, `Event chain validation successful`);

      return true;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Event chain validation failed: ${error}`,
      );
      return false;
    }
  }

  /**
   * Creates a complete ownable event chain with metadata
   * @param userAddress User's wallet address
   * @param networkId Network identifier
   * @param ownableData Ownable data
   * @param requestId Request ID for logging
   * @returns Complete event chain
   */
  public async createCompleteOwnableChain(
    userAddress: string,
    networkId: 'L' | 'T',
    ownableData: any,
    requestId: string,
  ): Promise<any> {
    try {
      this.loggingService.log(
        requestId,
        `Creating complete ownable chain for user: ${userAddress}`,
      );

      // Create event chain
      const eventChain = await this.createOwnableEventChain(
        userAddress,
        networkId,
        requestId,
      );

      // Add ownable metadata event
      const metadataEvent = {
        type: 'ownable-metadata',
        data: ownableData,
        timestamp: Date.now(),
        network: networkId === 'L' ? 'base-mainnet' : 'base-testnet',
      };

      await this.addEventToChain(
        eventChain,
        metadataEvent,
        'application/json',
        networkId,
        requestId,
      );

      // Add creation event
      const creationEvent = {
        type: 'ownable-created',
        timestamp: Date.now(),
        creator: userAddress,
        network: networkId === 'L' ? 'base-mainnet' : 'base-testnet',
      };

      await this.addEventToChain(
        eventChain,
        creationEvent,
        'application/json',
        networkId,
        requestId,
      );

      this.loggingService.log(
        requestId,
        `Complete ownable chain created successfully`,
      );

      return eventChain;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to create complete ownable chain: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Gets the latest event from an event chain
   * @param eventChain The event chain
   * @returns Latest event or null
   */
  public getLatestEvent(eventChain: any): any | null {
    return eventChain.events.length > 0
      ? eventChain.events[eventChain.events.length - 1]
      : null;
  }

  /**
   * Gets the state of an event chain
   * @param eventChain The event chain
   * @returns Chain state as Uint8Array
   */
  public getChainState(eventChain: any): Uint8Array {
    return eventChain.state;
  }

  /**
   * Checks if an event chain is signed
   * @param eventChain The event chain
   * @returns True if signed, false otherwise
   */
  public isChainSigned(eventChain: any): boolean {
    return eventChain.isSigned();
  }
}
