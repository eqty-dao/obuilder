import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { HttpService } from '@nestjs/axios';
import { LoggingService } from '../logging/redis-logging.service';
import { RedisQueueService } from '../queue/redis-queue.service';
import { TransactionIdData } from '../interfaces/TransactionIdData';
import { ethers } from 'ethers';

// Dynamic imports for ES modules
let Event: any;
let EventChain: any;
let Message: any;
let AnchorClient: any;
let Binary: any;

@Injectable()
export class EqtyService implements OnModuleInit {
  public eqtyMainnet: any;
  public eqtyTestnet: any;
  public eqtyAccountMainnet: ethers.HDNodeWallet;
  public eqtyAccountTestnet: ethers.HDNodeWallet;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggingService: LoggingService,
    private readonly queueService: RedisQueueService,
  ) {
    // Initialize EQTY instances for Mainnet and Testnet
    // Note: EventChain.create() requires address and networkId, but we'll initialize with placeholder values
    // The actual chains will be created per request with the user's wallet address
    this.eqtyMainnet = null as any; // Will be created per request
    this.eqtyTestnet = null as any; // Will be created per request

    // Initialize the accounts using mnemonics from the config service
    this.eqtyAccountMainnet = ethers.Wallet.fromPhrase(
      this.config.get('eth.account.mnemonic.mainnet'),
    );
    this.eqtyAccountTestnet = ethers.Wallet.fromPhrase(
      this.config.get('eth.account.mnemonic.testnet'),
    );
  }

  async onModuleInit() {
    await this.config.load();

    // Dynamic import of eqty-core ES module
    try {
      const eqtyCore = await import('eqty-core');
      Event = eqtyCore.Event;
      EventChain = eqtyCore.EventChain;
      Message = eqtyCore.Message;
      AnchorClient = eqtyCore.AnchorClient;
      Binary = eqtyCore.Binary;
    } catch (error) {
      console.error('Failed to import eqty-core:', error);
      throw error;
    }
  }

  /**
   * Creates an EventChain for the specified network and user address
   */
  public createEventChain(networkId: 'L' | 'T', userAddress: string): any {
    const chainId = networkId === 'L' ? 8453 : 84532; // Base mainnet : Base testnet
    return EventChain.create(userAddress, chainId);
  }

  /**
   * Creates a Message for sending to another wallet
   */
  public createMessage(data: any, mediaType: string = 'application/json'): any {
    return new Message(data, mediaType);
  }

  /**
   * Signs a message with the server's wallet
   */
  public async signMessageWithServerWallet(
    message: any,
    networkId: 'L' | 'T',
  ): Promise<any> {
    const signer =
      networkId === 'L' ? this.eqtyAccountMainnet : this.eqtyAccountTestnet;

    // Create a signer adapter for eqty-core
    const eqtySigner = {
      getAddress: async () => signer.address,
      signTypedData: async (domain: any, types: any, value: any) => {
        return await signer.signTypedData(domain, types, value);
      },
    };

    return await message.signWith(eqtySigner);
  }

  /**
   * Signs an event with the server's wallet
   */
  public async signEventWithServerWallet(
    event: any,
    networkId: 'L' | 'T',
  ): Promise<any> {
    const signer =
      networkId === 'L' ? this.eqtyAccountMainnet : this.eqtyAccountTestnet;

    // Create a signer adapter for eqty-core
    const eqtySigner = {
      getAddress: async () => signer.address,
      signTypedData: async (domain: any, types: any, value: any) => {
        return await signer.signTypedData(domain, types, value);
      },
    };

    await event.signWith(eqtySigner);
    return event;
  }

  /**
   * Anchors an event chain to Base blockchain
   */
  public async anchorEventChain(
    eventChain: any,
    networkId: 'L' | 'T',
  ): Promise<string> {
    const chainId = networkId === 'L' ? 8453 : 84532; // Base mainnet : Base testnet
    const contractAddress = AnchorClient.contractAddress(chainId);

    // Get the appropriate provider and signer
    const provider = new ethers.AlchemyProvider(
      { name: networkId === 'L' ? 'base' : 'base-sepolia', chainId },
      this.config.get('eth.account.arbitrum_alchemy_api_key'),
    );
    const signer =
      networkId === 'L' ? this.eqtyAccountMainnet : this.eqtyAccountTestnet;
    const connectedSigner = signer.connect(provider);

    // Create contract instance
    const contract = new ethers.Contract(
      contractAddress,
      AnchorClient.ABI,
      connectedSigner,
    );

    // Create anchor client
    const anchorClient = new AnchorClient(contract as any);

    // Anchor the event chain
    const tx = await anchorClient.anchor(eventChain.anchorMap);

    return typeof tx === 'object' && tx && 'hash' in tx
      ? (tx as any).hash
      : tx.toString();
  }

  /**
   * Gets the server wallet address for the specified network
   */
  public getEqtyAccountAddress(networkId: 'L' | 'T'): string {
    return networkId === 'L'
      ? this.eqtyAccountMainnet.address
      : this.eqtyAccountTestnet.address;
  }

  /**
   * Validates an Ethereum address
   */
  public isValidEqtyAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * Gets the server wallet balance for the specified network
   */
  public async getEqtyAccountBalance(networkId: 'L' | 'T'): Promise<string> {
    const address = this.getEqtyAccountAddress(networkId);

    const provider = new ethers.AlchemyProvider(
      {
        name: networkId === 'L' ? 'base' : 'base-sepolia',
        chainId: networkId === 'L' ? 8453 : 84532,
      },
      this.config.get('eth.account.arbitrum_alchemy_api_key'),
    );

    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  /**
   * Sends ETH to another wallet
   */
  public async sendETH(
    networkId: 'L' | 'T',
    recipientAddress: string,
    amount: string,
  ): Promise<string> {
    const provider = new ethers.AlchemyProvider(
      {
        name: networkId === 'L' ? 'base' : 'base-sepolia',
        chainId: networkId === 'L' ? 8453 : 84532,
      },
      this.config.get('eth.account.arbitrum_alchemy_api_key'),
    );

    const signer =
      networkId === 'L' ? this.eqtyAccountMainnet : this.eqtyAccountTestnet;
    const connectedSigner = signer.connect(provider);

    const tx = await connectedSigner.sendTransaction({
      to: recipientAddress,
      value: ethers.parseEther(amount),
    });

    await tx.wait();
    return tx.hash;
  }

  /**
   * Broadcasts a signed transaction to Base network
   */
  public async broadcastTransaction(
    networkId: 'L' | 'T',
    signedTransaction: any,
    requestId?: string,
  ): Promise<any> {
    const rid = requestId || `broadcast-${Date.now()}`;

    try {
      const provider = new ethers.AlchemyProvider(
        {
          name: networkId === 'L' ? 'base' : 'base-sepolia',
          chainId: networkId === 'L' ? 8453 : 84532,
        },
        this.config.get('eth.account.arbitrum_alchemy_api_key'),
      );

      this.loggingService.log(
        rid,
        `Broadcasting transaction to Base ${networkId} network`,
      );

      // Broadcast the transaction
      const tx = await provider.broadcastTransaction(signedTransaction);

      this.loggingService.log(
        rid,
        `Transaction successfully broadcast with hash: ${tx}`,
      );

      return { hash: tx };
    } catch (err) {
      this.loggingService.logError(
        rid,
        `Broadcasting transaction failed: ${err}`,
      );
      throw err;
    }
  }
}
