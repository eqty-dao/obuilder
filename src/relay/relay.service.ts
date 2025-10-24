import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggingService } from '../logging/redis-logging.service';
import { EqtyService } from '../eqty/eqty.service';
import { ConfigService } from '../config/config.service';
import { RedisQueueService } from '../queue/redis-queue.service';
import { OwnableStatus } from '../interfaces/QueueEntry';
import { TypedPackage } from 'src/interfaces/TypedPackage';
import { ethers } from 'ethers';

// Dynamic imports for ES modules
let Message: any;

@Injectable()
export class RelayService implements OnModuleInit {
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
    return this.config.get('eqty.relay') || this.config.get('eqty.local_relay');
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
   * @param content File content to send
   * @param sender Sender wallet address
   * @param recipient Recipient address
   * @param requestId Request ID for logging and tracking
   */
  public async sendFile(
    content: Uint8Array,
    sender: string,
    recipient: string,
    requestId: string,
    fileMeta?: any,
  ): Promise<string> {
    try {
      const relayURL = this.getRelayUrl();

      this.loggingService.log(
        requestId,
        `Sending File with sender:${sender} and recipient:${recipient}`,
      );

      if (!sender || !recipient) {
        this.loggingService.logError(
          requestId,
          `Provide the signer and recipient. signer: ${sender}  recipient:${recipient}`,
        );
        throw new Error(`Provide the signer and recipient`);
      }

      // Create message using eqty-core
      const message = new Message(
        content,
        'application/octet-stream',
        fileMeta,
      ).to(recipient);

      // Sign the message with the sender's wallet
      const signer = ethers.Wallet.fromPhrase(
        this.config.get('eth.account.mnemonic.mainnet'), // Use mainnet for now
      );

      const eqtySigner = {
        getAddress: async () => signer.address,
        signTypedData: async (domain: any, types: any, value: any) => {
          return await signer.signTypedData(domain, types, value);
        },
      };

      await message.signWith(eqtySigner);

      // Verify hash exists before sending
      if (!message.hash || !message.hash.hex) {
        this.loggingService.logError(
          requestId,
          'Message hash not created properly',
        );
        throw new Error('Message hash not available');
      }

      this.loggingService.log(requestId, `Message hash: ${message.hash.hex}`);

      this.loggingService.log(
        requestId,
        `Message: sender:${message.sender} recipient:${message.recipient} timestamp:${message.timestamp} mediaType:${message.mediaType}`,
      );

      try {
        // Send message to relay server
        const response = await fetch(`${relayURL}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'EQTY-Message-Type': 'file',
            'EQTY-Message-Sender': sender,
            'EQTY-Message-Recipient': recipient,
            'EQTY-Message-Signature': message.signature?.hex || '',
            'EQTY-Message-Timestamp': message.timestamp?.toString() || '',
            'EQTY-Message-Hash': message.hash.hex,
          },
          body: JSON.stringify({
            data: Array.from(content),
            mediaType: 'application/octet-stream',
            meta: fileMeta,
            sender: sender,
            recipient: recipient,
            signature: message.signature?.hex || '',
            timestamp: message.timestamp,
            hash: message.hash.hex,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.loggingService.logError(
            requestId,
            `Failed to send message to relay: ${errorText}`,
          );
          throw new Error(`Failed to send message to relay: ${errorText}`);
        }

        const result = await response.json();
        this.loggingService.log(
          requestId,
          `Message successfully sent to relay: ${JSON.stringify(result)}`,
        );

        return result.messageId || result.id || 'message-sent';
      } catch (relayError) {
        this.loggingService.logError(
          requestId,
          `Relay communication error: ${relayError}`,
        );
        throw relayError;
      }
    } catch (err) {
      this.loggingService.logError(requestId, `Sending file failed: ${err}`);
      throw err;
    }
  }

  /**
   * Sends a typed package through relay
   * @param typedPackage The typed package to send
   * @param sender Sender wallet address
   * @param recipient Recipient address
   * @param requestId Request ID for logging and tracking
   */
  public async sendTypedPackage(
    typedPackage: TypedPackage,
    sender: string,
    recipient: string,
    requestId: string,
  ): Promise<string> {
    try {
      const relayURL = this.getRelayUrl();

      this.loggingService.log(
        requestId,
        `Sending Typed Package with sender:${sender} and recipient:${recipient}`,
      );

      if (!sender || !recipient) {
        this.loggingService.logError(
          requestId,
          `Provide the signer and recipient. signer: ${sender}  recipient:${recipient}`,
        );
        throw new Error(`Provide the signer and recipient`);
      }

      // Convert typed package to Uint8Array
      const packageData = new TextEncoder().encode(
        JSON.stringify(typedPackage),
      );

      // Create message using eqty-core
      const message = new Message(packageData, 'application/json').to(
        recipient,
      );

      // Sign the message with the sender's wallet
      const signer = ethers.Wallet.fromPhrase(
        this.config.get('eth.account.mnemonic.mainnet'), // Use mainnet for now
      );

      const eqtySigner = {
        getAddress: async () => signer.address,
        signTypedData: async (domain: any, types: any, value: any) => {
          return await signer.signTypedData(domain, types, value);
        },
      };

      await message.signWith(eqtySigner);

      // Verify hash exists before sending
      if (!message.hash || !message.hash.hex) {
        this.loggingService.logError(
          requestId,
          'Message hash not created properly',
        );
        throw new Error('Message hash not available');
      }

      this.loggingService.log(requestId, `Message hash: ${message.hash.hex}`);

      try {
        // Send message to relay server
        const response = await fetch(`${relayURL}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'EQTY-Message-Type': 'typed-package',
            'EQTY-Message-Sender': sender,
            'EQTY-Message-Recipient': recipient,
            'EQTY-Message-Signature': message.signature?.hex || '',
            'EQTY-Message-Timestamp': message.timestamp?.toString() || '',
            'EQTY-Message-Hash': message.hash.hex,
          },
          body: JSON.stringify({
            data: Array.from(packageData),
            mediaType: 'application/json',
            meta: { type: 'typed-package' },
            sender: sender,
            recipient: recipient,
            signature: message.signature?.hex || '',
            timestamp: message.timestamp,
            hash: message.hash.hex,
            typedPackage: typedPackage,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.loggingService.logError(
            requestId,
            `Failed to send typed package to relay: ${errorText}`,
          );
          throw new Error(
            `Failed to send typed package to relay: ${errorText}`,
          );
        }

        const result = await response.json();
        this.loggingService.log(
          requestId,
          `Typed package successfully sent to relay: ${JSON.stringify(result)}`,
        );

        return result.messageId || result.id || 'typed-package-sent';
      } catch (relayError) {
        this.loggingService.logError(
          requestId,
          `Relay communication error: ${relayError}`,
        );
        throw relayError;
      }
    } catch (err) {
      this.loggingService.logError(
        requestId,
        `Sending typed package failed: ${err}`,
      );
      throw err;
    }
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
