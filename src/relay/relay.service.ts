import { Injectable } from '@nestjs/common';
import { LoggingService } from '../logging/logging.service';
import { LtoService } from '../lto/lto.service';
import { ConfigService } from '../config/config.service';
import { QueueService } from '../queue/queue.service';
import { Relay, Message, Account } from '@ltonetwork/lto';
import { OwnableStatus } from '../interfaces/QueueEntry';
import { TypedPackage } from 'src/interfaces/TypedPackage';
import { IMessageMeta } from '@ltonetwork/lto/interfaces';

@Injectable()
export class RelayService {
  constructor(
    private readonly loggingService: LoggingService,
    private readonly ltoService: LtoService,
    private readonly config: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Gets the configured relay URL
   * @returns The relay URL from configuration
   */
  public getRelayUrl(): string {
    return this.config.get('lto.relay') || this.config.get('lto.local_relay');
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
   * Sends file content through relay
   * @param content File content to send
   * @param sender Sender account
   * @param recipient Recipient address
   * @param requestId Request ID for logging and tracking
   */
  public async sendFile(
    content: Uint8Array,
    sender: Account,
    recipient: string,
    requestId: string,
    fileMeta: IMessageMeta,
  ): Promise<string> {
    try {
      const relayURL = this.getRelayUrl();
      const relay: Relay = new Relay(relayURL);
      let message: Message;

      const ltoNetwork = this.getLtoNetwork(recipient);
      this.loggingService.log(
        requestId,
        `Sending File with sender:${sender.address} and recipient:${recipient}`,
      );

      if (!sender || !recipient) {
        this.loggingService.logError(
          requestId,
          `Provide the signer and recipient. signer: ${sender?.address}  recipient:${recipient}`,
        );
        throw new Error(`Provide the signer and recipient`);
      }

      message = new Message(content, 'application/octet-stream', fileMeta)
        .to(recipient)
        .signWith(sender);
      // Verify hash exists before sending
      if (!message.hash || !message.hash.base58) {
        this.loggingService.logError(
          requestId,
          'Message hash not created properly',
        );
        throw new Error('Message hash not available');
      }
      this.loggingService.log(
        requestId,
        `Message hash: ${message.hash.base58}`,
      );
      this.loggingService.log(
        requestId,
        `Message: type${message.type} sender:${JSON.stringify(message.sender)} recipient:${message.recipient} timestamp:${message.timestamp} mediaType:${message.mediaType}`,
      );
      try {
        // Store the hash before sending
        const hashBase58 = message.hash.base58;
        console.log('hashBase58', hashBase58);
        console.log('requestId', requestId);

        await relay.send(message);
        this.loggingService.log(
          requestId,
          `Ownable successfully sent to Relay. Setting Queue status to sent.`,
        );

        if (ltoNetwork === 'L') {
          await this.queueService.setQueueEntryStatus(
            'L',
            requestId,
            OwnableStatus.Sent,
            hashBase58,
          );
        } else {
          await this.queueService.setQueueEntryStatus(
            'T',
            requestId,
            OwnableStatus.Sent,
            hashBase58,
          );
        }

        return hashBase58;
      } catch (err) {
        this.loggingService.logError(requestId, `Error relay.send: ${err}`);
        throw err;
      }
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Send file error: ${error.message}`,
      );
      throw error;
    }
  }
  private wait = (n: number) =>
    new Promise((resolve) => setTimeout(resolve, n));

  /**
   * Sends an ownable file to a recipient
   * @param ltoNetworkId L for mainnet, T for testnet
   * @param requestId Request ID for logging and tracking
   * @param recipient Recipient address
   * @param content File content to send
   */
  public async sendOwnable(
    ltoNetworkId: 'L' | 'T',
    requestId: string,
    recipient: string,
    content?: Uint8Array,
    metadata?: IMessageMeta,
  ): Promise<string> {
    console.log('requestId', requestId);
    console.log('ltoNetworkId', ltoNetworkId);
    console.log('recipient', recipient);

    const relayURL = this.getRelayUrl();
    let sender: Account;
    this.wait(5000);
    // Add entry check and logging
    this.loggingService.log(
      requestId,
      `PRE-SEND: Checking queue entry existence`,
    );
    // console.log("5");
    // this.queueService.showQueue();
    const [entry, index] = this.queueService.getQueueEntryByRequestId(
      ltoNetworkId,
      requestId,
    );
    // console.log("6");
    // this.queueService.showQueue();
    this.loggingService.log(
      requestId,
      `PRE-SEND: Entry exists: ${!!entry}, index: ${index}`,
    );

    const ltoNetworkIdRecipient = this.getLtoNetwork(recipient);
    this.loggingService.log(
      requestId,
      `Sending Ownablefile... RELAY:${relayURL} RECIPIENT:${recipient} RID:${requestId} NETWORKID: ${ltoNetworkId}.`,
    );

    if (ltoNetworkId !== ltoNetworkIdRecipient) {
      this.loggingService.logError(
        requestId,
        `Lto NetworkIds of currently produced Ownable ${ltoNetworkId} and recipient ${ltoNetworkIdRecipient} do not match`,
      );
      throw new Error(
        `Lto NetworkIds of currently produced Ownable ${ltoNetworkId} and recipient ${ltoNetworkIdRecipient} do not match`,
      );
    }

    if (ltoNetworkId == 'L') {
      sender = this.ltoService.ltoAccountMainnet;
    } else if (ltoNetworkId == 'T') {
      sender = this.ltoService.ltoAccountTestnet;
    } else {
      this.loggingService.logError(
        requestId,
        `Unknown ltoNetworkID ${ltoNetworkId}`,
      );
      throw new Error(`Unknown ltoNetworkID ${ltoNetworkId}`);
    }

    try {
      this.loggingService.log(
        requestId,
        `Try sending file... RELAYURL:${relayURL} SENDER:${sender.address} RECIPIENT:${recipient} RID:${requestId}`,
      );
      if (recipient) {
        this.loggingService.log(
          requestId,
          `Recipient: ${recipient} RID:${requestId}.`,
        );
        const hashBase58 = await this.sendFile(
          content,
          sender,
          recipient,
          requestId,
          metadata,
        );

        // Check if entry still exists before we try to update status
        this.loggingService.log(
          requestId,
          `POST-SEND: Checking queue entry existence`,
        );
        const [postEntry, postIndex] =
          this.queueService.getQueueEntryByRequestId(ltoNetworkId, requestId);
        this.loggingService.log(
          requestId,
          `POST-SEND: Entry exists: ${!!postEntry}, index: ${postIndex}`,
        );

        // If entry is missing but file was sent, create a new one with Sent status
        if (!postEntry || postIndex === -1) {
          this.loggingService.logError(
            requestId,
            `Queue entry missing after successful send. Creating new entry with Sent status.`,
          );

          // We could recreate an entry here or let the caller handle this
          const queue =
            ltoNetworkId === 'L'
              ? this.queueService.queueMainnet
              : this.queueService.queueTestnet;

          // Create a minimal entry if needed
          if (!entry) {
            const newEntry = {
              rid: requestId,
              ltoNetworkId: ltoNetworkId,
              ltoWallet: recipient,
              timestampProcessing: Math.floor(Date.now() / 1000),
              ownableStatus: OwnableStatus.Sent,
              hash: hashBase58,
            };

            queue.push(newEntry);
            await this.queueService.updateQueueInS3Bucket(ltoNetworkId);
            this.loggingService.log(
              requestId,
              `Created new entry with Sent status`,
            );
          }
        }

        return hashBase58;
      } else {
        this.loggingService.logError(
          requestId,
          `Failed to send Ownable RELAY:${relayURL} SENDER:${sender.address} RECIPIENT:${recipient} RID:${requestId}.`,
        );
        throw new Error('No recipient provided');
      }
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Error sending message: ${error}`,
      );
      throw new Error(`Error sending message: ${error}`);
    }
  }

  /**
   * Gets the LTO network for an address
   * @param address LTO address
   * @returns 'L' for mainnet, 'T' for testnet
   */
  private getLtoNetwork(address: string): 'L' | 'T' {
    const isValidMainnet = this.ltoService.ltoMainnet.isValidAddress(address);
    const isValidTestnet = this.ltoService.ltoTestnet.isValidAddress(address);

    if (isValidMainnet) return 'L';
    if (isValidTestnet) return 'T';

    throw new Error(`Invalid LTO address: ${address}`);
  }
}
