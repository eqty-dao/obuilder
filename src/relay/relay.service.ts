import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggingService } from '../logging/redis-logging.service';
import { EqtyService } from '../eqty/eqty.service';
import { ConfigService } from '../config/config.service';
import { RedisQueueService } from '../queue/redis-queue.service';
import { TypedPackage } from 'src/interfaces/TypedPackage';
import { ethers } from 'ethers';

// Dynamic imports for ES modules
let Message: any;
let Relay: any;
let Binary: any;

@Injectable()
export class RelayService implements OnModuleInit {
  private relay: any;

  constructor(
    private readonly loggingService: LoggingService,
    private readonly eqtyService: EqtyService,
    private readonly config: ConfigService,
    private readonly queueService: RedisQueueService,
  ) {}

  async onModuleInit() {
    // Dynamic import of eqty-core ES module
    try {
      const eqtyCore = await import('eqty-core');
      Message = eqtyCore.Message;
      Relay = eqtyCore.Relay;
      Binary = eqtyCore.Binary;

      // Initialize Relay instance
      const relayURL = this.getRelayUrl();
      this.relay = new Relay(relayURL);
    } catch (error) {
      console.error('Failed to import eqty-core in RelayService:', error);
      throw error;
    }
  }

  /**
   * Gets the configured relay URL
   * @returns The relay URL from configuration
   */
  public getRelayUrl(): string {
    const relay = this.config.get('eqty.relay');
    const localRelay = this.config.get('eqty.local_relay');
    const envRelay = process.env.RELAY_SERVER;

    // Log for debugging
    console.log('[RelayService] Config values:', {
      'eqty.relay': relay,
      'eqty.local_relay': localRelay,
      'RELAY_SERVER env': envRelay,
    });

    const url = relay || localRelay || envRelay || '';

    if (url) {
      console.log('[RelayService] Using relay URL:', url);
    } else {
      console.warn('[RelayService] No relay URL configured!');
    }

    return url;
  }

  /**
   * Checks if a relay server is responsive
   * @param url URL of the relay server
   * @returns Promise resolving to boolean indicating if relay is up
   */
  public async isRelayUp(url: string | undefined): Promise<boolean> {
    if (!url) {
      throw new Error(`Undefined relay URL`);
    }

    try {
      const response = await fetch(url, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (e) {
      throw new Error(`Relay Server ${url} is down: ${e}`);
    }
  }

  /**
   * Public method to check if the configured relay server is up
   * @returns Success message or throws error
   */
  public async isRelayServerUp(): Promise<string> {
    const relayURL = this.getRelayUrl();

    try {
      const isUp: boolean = await this.isRelayUp(relayURL);
      if (isUp) {
        return `SUCCESS: Relay Server ${relayURL} is up and running!`;
      }
    } catch (error) {
      throw new Error(`Relay Server ${relayURL} is down: ${error}`);
    }
  }

  /**
   * Sends file content through relay using eqty-core
   * @param content
   * @param sender
   * @param recipient
   * @param requestId
   * @param fileMeta
   * @param networkId
   */
  public async sendFile(
    content: Uint8Array,
    sender: string,
    recipient: string,
    requestId: string,
    fileMeta?: any,
    networkId?: 'L' | 'T',
  ): Promise<string> {
    try {
      this.loggingService.log(
        requestId,
        `Sending File with sender:${sender} and recipient:${recipient}`,
      );

      if (!recipient) {
        this.loggingService.logError(
          requestId,
          `Recipient is required. recipient: ${recipient}`,
        );
        throw new Error(`Recipient is required`);
      }

      // Get the signer from config (server wallet)
      const mnemonic = this.config.get('eth.account.mnemonic.mainnet');
      if (!mnemonic) {
        throw new Error('Server wallet mnemonic not configured');
      }

      const signer = ethers.Wallet.fromPhrase(mnemonic);

      const eqtySigner = {
        getAddress: async () => signer.address,
        signTypedData: async (domain: any, types: any, value: any) => {
          return await signer.signTypedData(domain, types, value);
        },
      };

      const messageContent = Binary.from(content);

      const meta: any = {
        type: fileMeta?.type || 'ownable',
        title: fileMeta?.title || '',
        description: fileMeta?.description || '',
      };

      if (fileMeta?.thumbnail) {
        if (
          fileMeta.thumbnail.base64 &&
          typeof fileMeta.thumbnail.base64 === 'string'
        ) {
          meta.thumbnail = fileMeta.thumbnail.base64;
        } else if (typeof fileMeta.thumbnail === 'string') {
          // Already a base64 string
          meta.thumbnail = fileMeta.thumbnail;
        } else if (
          fileMeta.thumbnail instanceof Uint8Array ||
          Buffer.isBuffer(fileMeta.thumbnail)
        ) {
          meta.thumbnail = Buffer.from(fileMeta.thumbnail).toString('base64');
        }
      }

      const message = new Message(
        messageContent,
        'application/octet-stream',
        meta,
      ).to(recipient);

      await message.signWith(eqtySigner);

      if (!message.isSigned()) {
        throw new Error('Message signing failed');
      }

      // Verify hash exists
      if (!message.hash || !message.hash.hex) {
        this.loggingService.logError(
          requestId,
          'Message hash not created properly',
        );
        throw new Error('Message hash not available');
      }

      const senderAddress = await eqtySigner.getAddress();
      this.loggingService.log(
        requestId,
        `Message: sender:${senderAddress} recipient:${message.recipient} timestamp:${message.timestamp} mediaType:${message.mediaType}`,
      );
      this.loggingService.log(requestId, `Message hash: ${message.hash.hex}`);

      // Anchor the message hash before sending (if networkId is provided)
      if (networkId) {
        try {
          const txHash = await this.eqtyService.anchorMessageHash(
            message.hash,
            networkId,
          );
          this.loggingService.log(
            requestId,
            `Message hash anchored to Base ${networkId} network with tx: ${txHash} (signed by server wallet: ${senderAddress})`,
          );
        } catch (error) {
          this.loggingService.logError(
            requestId,
            `Failed to anchor message before sending: ${error}`,
          );
          // Continue sending even if anchoring fails
        }
      }

      // Send message to POST /messages endpoint (same as eqty-core Relay.send())
      // Relay server expects { message: message.toJSON() } format
      const relayURL = this.getRelayUrl();
      if (!relayURL) {
        throw new Error(
          'Relay URL not configured. Set RELAY_SERVER environment variable.',
        );
      }

      const messageJson = message.toJSON();
      const relayMessage = { message: messageJson };

      const response = await fetch(`${relayURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(relayMessage),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.loggingService.logError(
          requestId,
          `Failed to send message to relay: ${response.status} - ${errorText}`,
        );
        throw new Error(`Relay error: ${response.status} - ${errorText}`);
      }

      this.loggingService.log(
        requestId,
        `Message successfully sent to relay. Hash: ${message.hash.base58 || message.hash.hex}`,
      );

      return message.hash.base58 || message.hash.hex;
    } catch (err) {
      this.loggingService.logError(requestId, `Sending file failed: ${err}`);
      throw err;
    }
  }

  /**
   * Sends a typed package through relay
   * Note: This method is deprecated. Use sendFile with the actual ZIP content instead.
   * @param typedPackage The typed package metadata (not used, kept for compatibility)
   * @param sender Sender wallet address (not used for signing, but for logging)
   * @param recipient Recipient address
   * @param requestId Request ID for logging and tracking
   */
  public async sendTypedPackage(
    typedPackage: TypedPackage,
    sender: string,
    recipient: string,
    requestId: string,
  ): Promise<string> {
    // This method is kept for backward compatibility but should not be used
    // The actual ZIP file should be sent using sendFile instead
    this.loggingService.log(
      requestId,
      `Warning: sendTypedPackage is deprecated. Use sendFile with actual ZIP content instead.`,
    );
    throw new Error(
      'sendTypedPackage is deprecated. Use sendFile with the actual ZIP file content instead.',
    );
  }

  /**
   * Determines the network based on recipient address
   * For EQTY, we'll use Base network (mainnet/testnet)
   */
  private getEqtyNetwork(recipient: string): 'L' | 'T' {
    // For now, default to mainnet ('L')
    // In the future, this could be determined by the recipient address format
    // or by checking which network the address belongs to
    return 'L';
  }

  /**
   * Sends a notification to the relay server about a completed ownable
   * @param recipient Recipient address
   * @param tokenURI Token URI of the minted NFT
   * @param txHash Transaction hash
   * @param requestId Request ID for logging
   */
  public async notifyRelay(
    recipient: string,
    tokenURI: string,
    txHash: string,
    requestId: string,
  ): Promise<void> {
    try {
      const relayURL = this.getRelayUrl();

      this.loggingService.log(
        requestId,
        `Notifying relay about completed ownable for recipient:${recipient}`,
      );

      const notificationData = {
        recipient,
        tokenURI,
        txHash,
        timestamp: Date.now(),
        type: 'ownable-completed',
      };

      const response = await fetch(`${relayURL}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'EQTY-Notification-Type': 'ownable-completed',
        },
        body: JSON.stringify(notificationData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.loggingService.logError(
          requestId,
          `Failed to notify relay: ${errorText}`,
        );
        throw new Error(`Failed to notify relay: ${errorText}`);
      }

      this.loggingService.log(
        requestId,
        `Successfully notified relay about completed ownable`,
      );
    } catch (err) {
      this.loggingService.logError(requestId, `Failed to notify relay: ${err}`);
      throw err;
    }
  }
}
