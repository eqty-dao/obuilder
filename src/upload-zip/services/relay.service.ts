import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { EqtyService } from '../../eqty/eqty.service';
import { LoggingService } from '../../logging/logging.service';
import { QueueService } from '../../queue/queue.service';
import { OwnableStatus } from '../../interfaces/QueueEntry';

/**
 * OwnableRelayService
 *
 * Handles message relay operations for sending Ownables via Base blockchain.
 * Extracted from UploadZipService for better separation of concerns.
 */
@Injectable()
export class OwnableRelayService {
    private readonly logger = new Logger(OwnableRelayService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly eqtyService: EqtyService,
        private readonly loggingService: LoggingService,
        private readonly queueService: QueueService,
    ) { }

    /**
     * Get relay URL from configuration
     */
    public getRelayUrl(): string {
        return (this.config as any).get('eqty.relayUrl') || 'https://relay.eqty.io';
    }

    /**
     * Check if relay server is up
     * @param url Relay URL to check
     */
    public async isRelayUp(url: string | undefined): Promise<boolean> {
        if (!url) {
            throw new Error('Undefined relay URL in oBuilder');
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
     * Check if relay server is up and return status message
     */
    public async isRelayServerUp(): Promise<string> {
        const relayURL = this.getRelayUrl();

        try {
            const isUp = await this.isRelayUp(relayURL);
            if (isUp) {
                return `SUCCESS: oRelay Server ${relayURL} is up and running!`;
            }
            return `FAILURE: oRelay Server ${relayURL} is not responding`;
        } catch (error) {
            throw new Error(`Relay Server ${relayURL} is down: ${error}`);
        }
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
        content?: Uint8Array,
    ): Promise<void> {
        // Validate Ethereum address
        if (!this.eqtyService.isValidAddress(recipient)) {
            this.loggingService.logError(rid, `Invalid Ethereum address: ${recipient}`);
            throw new Error(`Invalid Ethereum address: ${recipient}. Expected 0x-prefixed hex address.`);
        }

        const senderAddress = this.eqtyService.getAddress(networkType);
        const relayUrl = this.getRelayUrl();

        this.loggingService.log(
            rid,
            `Sending Ownable via Base ${networkType}... RELAY:${relayUrl} RECIPIENT:${recipient} RID:${rid}`,
        );

        if (!content) {
            this.loggingService.logError(rid, 'No content provided for ownable');
            throw new Error('No content provided for ownable');
        }

        try {
            this.loggingService.log(
                rid,
                `Try sending file... SENDER:${senderAddress} RECIPIENT:${recipient} RID:${rid}`,
            );

            // Create and sign message using EqtyService
            const { message, hash } = await this.eqtyService.createAndSendMessage(
                content,
                recipient,
                networkType,
                relayUrl,
                'application/octet-stream',
            );

            this.loggingService.log(rid, `Message hash: ${hash}`);
            this.loggingService.log(
                rid,
                `Ownable successfully sent to Relay via Base ${networkType}. Setting Queue status to sent.`,
            );

            // Update queue status with network type indicator
            const networkId = networkType === 'mainnet' ? 'L' : 'T'; // Temporary: use L/T for queue compat
            await this.queueService.setQueueEntryStatus(networkId, rid, OwnableStatus.Sent, hash);
        } catch (error) {
            this.loggingService.logError(rid, `Error sending message via Base: ${error}`);
            throw new Error(`Error sending message via Base: ${error}`);
        }
    }

    /**
     * @deprecated LTO network no longer exists - use sendOwnableBase instead
     */
    public async sendOwnable(
        ltoNetworkId: 'L' | 'T',
        rid: string,
        recipient: string,
        content?: Uint8Array,
    ): Promise<void> {
        const networkType = ltoNetworkId === 'L' ? 'mainnet' : 'testnet';
        await this.sendOwnableBase(networkType, rid, recipient, content);
    }
}
