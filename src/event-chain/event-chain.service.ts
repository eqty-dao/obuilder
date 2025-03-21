import { Injectable } from '@nestjs/common';
import { LoggingService } from '../logging/logging.service';
import { LtoService } from '../lto/lto.service';
import { FileManagementService } from '../file-management/file-management.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { EventChain, Event, Account } from '@ltonetwork/lto';
import { Buffer } from 'buffer';
import * as path from 'path';
import * as fs from 'fs';

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
export class EventChainService {
  private pathToCids: string;

  constructor(
    private readonly loggingService: LoggingService,
    private readonly ltoService: LtoService,
    private readonly fileManagement: FileManagementService,
    private readonly telegramService: TelegramBotService,
  ) {
    // Set the path from configuration or default
    this.pathToCids = process.env.OWNABLE_CID_PATH || './storage/ownable-cids';
  }
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }
  /**
   * Create an EventChain for an Ownable package
   * @param pkg The package to create an EventChain for
   * @param nftInfo NFT information to include in the event chain
   * @param receiver The receiver address
   * @returns Buffer containing the event chain data
   */
  public async createEventChain(pkg: TypedPackage, nftInfo: NftInfo, receiver: string): Promise<Buffer> {
    const ltoNetworkId = this.getNetwork(receiver);
    let ltoAccount: Account;

    if (ltoNetworkId === 'L') {
      ltoAccount = this.ltoService.ltoAccountMainnet;
    } else {
      ltoAccount = this.ltoService.ltoAccountTestnet;
    }

    const chain: EventChain = new EventChain(ltoAccount);
    var buf: Buffer;
    
    if (pkg.isDynamic) {
      let msg: any;
      if (nftInfo.id != 0) {
        msg = {
          "@context": "instantiate_msg.json",
          ownable_id: chain.id,
          package: pkg.cid,
          network_id: ltoNetworkId,
          keywords: pkg.keywords,
          nft: {
            network: nftInfo.network, 
            id: nftInfo.id.toString(), 
            address: nftInfo.address,
          },
        };
      } else {
        msg = {
          "@context": "instantiate_msg.json",
          ownable_id: chain.id,
          package: pkg.cid,
          network_id: ltoNetworkId,
          keywords: pkg.keywords,
        };
      }

      new Event(msg)
        .addTo(chain)
        .signWith(ltoAccount);

      new Event({ "@context": 'execute_msg.json', transfer: { to: receiver } })
        .addTo(chain)
        .signWith(ltoAccount);

      const appendedEvents = chain.startingWith(chain.events[0]);
      const anchorMap1 = appendedEvents.anchorMap;
      
      try {
        if (ltoNetworkId === 'L') {
          await this.ltoService.ltoMainnet.anchor(ltoAccount, ...anchorMap1);
        } else {
          await this.ltoService.ltoTestnet.anchor(ltoAccount, ...anchorMap1);
        }
      } catch (err) {
        this.loggingService.logError(pkg.cid, `Anchoring Failed: ${err}`);
        throw err;
      }

      await this.validateEventChain(chain, ltoNetworkId, pkg.cid);

	  const dirPath = path.join(this.pathToCids, pkg.cid);
    await this.ensureDirectoryExists(dirPath);
      const json1 = path.join(this.pathToCids, pkg.cid, `${pkg.cid}.json`);
      try {
        await this.fileManagement.writeFile(json1, JSON.stringify(chain), pkg.cid);
      } catch (err) {
        this.loggingService.logError(pkg.cid, `Writing ${json1} failed`);
        throw err;
      }

      try {
        const file = await this.fileManagement.readTextFile(json1);
        buf = Buffer.from(file, 'utf8');
        
        // Double-check imported EventChain
        await this.validateEventChainFromJSON(file, ltoNetworkId, pkg.cid);
      } catch (err) {
        this.loggingService.logError(pkg.cid, `Reading or validating ${json1} failed: ${err}`);
        throw err;
      }
    }

    return buf;
  }

  /**
   * Validates an EventChain
   * @param chain The EventChain to validate
   * @param ltoNetworkId The LTO network ID ('L' or 'T')
   * @param loggingId ID to use for logging (often the CID)
   */
  public async validateEventChain(chain: EventChain, ltoNetworkId: 'L' | 'T', loggingId: string): Promise<void> {
    // Validate the chain 
    chain.validate();
    
    // Check if the chain was created by the genesis signer
    let genesisSigner: Account;
    if (ltoNetworkId === 'L') {
      genesisSigner = this.ltoService.ltoMainnet.account(chain.events[0].signKey);
    } else {
      genesisSigner = this.ltoService.ltoTestnet.account(chain.events[0].signKey);
    }
    
    if (!chain.isCreatedBy(genesisSigner)) {
      this.loggingService.logError(loggingId, `Event chain hijacking: genesis event not signed by chain creator on LTO Network ${ltoNetworkId}`);
      throw new Error(`Event chain hijacking: genesis event not signed by chain creator on LTO Network ${ltoNetworkId}`);
    } else {
      this.loggingService.log(loggingId, `Event chain validation successful on LTO Network ${ltoNetworkId}`);
    }
  }

  /**
   * Validates an EventChain from its JSON representation
   * @param jsonData The JSON data of the EventChain
   * @param ltoNetworkId The LTO network ID ('L' or 'T') 
   * @param loggingId ID to use for logging
   */
  public async validateEventChainFromJSON(jsonData: string, ltoNetworkId: 'L' | 'T', loggingId: string): Promise<void> {
    try {
      const data: IEventChainJSON = JSON.parse(jsonData);
      const chain = EventChain.from(data);
      await this.validateEventChain(chain, ltoNetworkId, loggingId);
    } catch (error) {
      this.loggingService.logError(loggingId, `Failed to parse or validate EventChain JSON: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieves an EventChain by its ID
   * @param chainId The EventChain ID
   * @param packageCid The package CID (used for file path)
   */
  public async getEventChainById(chainId: string, packageCid: string): Promise<EventChain> {
    const filePath = path.join(this.pathToCids, packageCid, `${packageCid}.json`);
    
    try {
      const fileContent = await this.fileManagement.readTextFile(filePath);
      const data = JSON.parse(fileContent);
      return EventChain.from(data);
    } catch (error) {
      this.loggingService.logError(packageCid, `Failed to retrieve EventChain ${chainId}: ${error.message}`);
      throw new Error(`Failed to retrieve EventChain ${chainId}: ${error.message}`);
    }
  }

  /**
   * Add a new event to an existing chain
   * @param chainId The chain ID
   * @param packageCid The package CID
   * @param eventData The event data to add
   * @param ltoNetworkId The LTO network ID
   */
  public async addEventToChain(
    chainId: string, 
    packageCid: string, 
    eventData: any, 
    ltoNetworkId: 'L' | 'T'
  ): Promise<EventChain> {
    const chain = await this.getEventChainById(chainId, packageCid);
    let ltoAccount: Account;
    
    if (ltoNetworkId === 'L') {
      ltoAccount = this.ltoService.ltoAccountMainnet;
    } else {
      ltoAccount = this.ltoService.ltoAccountTestnet;
    }
    
    // Add the new event
    new Event(eventData).addTo(chain).signWith(ltoAccount);
    
    // Anchor the chain
    const appendedEvents = chain.startingWith(chain.events[chain.events.length - 1]);
    const anchorMap = appendedEvents.anchorMap;
    
    try {
      if (ltoNetworkId === 'L') {
        await this.ltoService.ltoMainnet.anchor(ltoAccount, ...anchorMap);
      } else {
        await this.ltoService.ltoTestnet.anchor(ltoAccount, ...anchorMap);
      }
    } catch (err) {
      this.loggingService.logError(packageCid, `Anchoring Failed for new event: ${err}`);
      throw err;
    }
    
    // Save the updated chain
    const filePath = path.join(this.pathToCids, packageCid, `${packageCid}.json`);
    await this.fileManagement.writeFile(filePath, JSON.stringify(chain), packageCid);
    
    return chain;
  }

  /**
   * Verify if an address belongs to a specific LTO network
   * @param address LTO address to check
   * @returns 'L' for mainnet, 'T' for testnet, or 'false' if invalid
   */
  public getNetwork(address: string): 'L' | 'T' {
    const isValidMainnet = this.ltoService.ltoMainnet.isValidAddress(address);
    const isValidTestnet = this.ltoService.ltoTestnet.isValidAddress(address);
    
    if (isValidMainnet) return "L";
    if (isValidTestnet) return "T";
    
    throw new Error(`Invalid LTO address: ${address}`);
  }
}