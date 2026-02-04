import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { JsonRpcProvider, Wallet, Contract, TransactionResponse } from 'ethers';
import { IEqtyFactory, IMessage, IRelay, ISigner, EqtyCoreFactory, EQTY_FACTORY } from './eqty.interfaces';

// Use require for CommonJS compatibility with eqty-core (fallback)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const eqtyCore = require('eqty-core');

/**
 * EthersSigner adapter for eqty-core ISigner interface
 * Wraps ethers Wallet to work with eqty-core's signWith methods
 */
class EthersSigner implements ISigner {
    constructor(private wallet: Wallet) { }

    async getAddress(): Promise<string> {
        return this.wallet.address;
    }

    async signTypedData(
        domain: Record<string, any>,
        types: Record<string, any[]>,
        value: Record<string, any>,
    ): Promise<string> {
        return this.wallet.signTypedData(domain, types, value);
    }
}

export interface EqtyNetworkConfig {
    rpcUrl: string;
    chainId: number;
    anchorContractAddress: string;
}

@Injectable()
export class EqtyService implements OnModuleInit {
    private readonly logger = new Logger(EqtyService.name);
    private readonly factory: IEqtyFactory;

    // Mainnet (Base)
    private providerMainnet: JsonRpcProvider | null = null;
    private walletMainnet: Wallet | null = null;
    private signerMainnet: EthersSigner | null = null;
    private anchorClientMainnet: any = null;

    // Testnet (Base Sepolia)
    private providerTestnet: JsonRpcProvider | null = null;
    private walletTestnet: Wallet | null = null;
    private signerTestnet: EthersSigner | null = null;
    private anchorClientTestnet: any = null;

    // Network IDs
    private readonly MAINNET_CHAIN_ID = 8453; // Base Mainnet
    private readonly TESTNET_CHAIN_ID = 84532; // Base Sepolia

    constructor(
        private readonly config: ConfigService,
        @Optional() @Inject(EQTY_FACTORY) factory?: IEqtyFactory
    ) {
        // Use injected factory or default to real eqty-core implementation
        this.factory = factory || new EqtyCoreFactory();
    }

    async onModuleInit() {
        await this.config.load();
        this.initializeNetworks();
    }

    private initializeNetworks(): void {
        // Initialize Mainnet (Base)
        const mainnetRpc = this.getConfigSafe('eqty.rpc.mainnet') || 'https://mainnet.base.org';
        const mainnetPrivateKey = this.getConfigSafe('eqty.privateKey.mainnet');

        if (mainnetPrivateKey && typeof mainnetPrivateKey === 'string') {
            this.providerMainnet = new JsonRpcProvider(mainnetRpc as string);
            this.walletMainnet = new Wallet(mainnetPrivateKey, this.providerMainnet);
            this.signerMainnet = new EthersSigner(this.walletMainnet);

            const anchorAddress = eqtyCore.AnchorClient.contractAddress(this.MAINNET_CHAIN_ID);
            const contract = new Contract(anchorAddress, eqtyCore.AnchorClient.ABI, this.walletMainnet);
            this.anchorClientMainnet = new eqtyCore.AnchorClient(contract);

            this.logger.log(`Initialized Base Mainnet: ${this.walletMainnet.address}`);
        } else {
            this.logger.warn('No mainnet private key configured for EQTY');
        }

        // Initialize Testnet (Base Sepolia)
        const testnetRpc = this.getConfigSafe('eqty.rpc.testnet') || 'https://sepolia.base.org';
        const testnetPrivateKey = this.getConfigSafe('eqty.privateKey.testnet');

        if (testnetPrivateKey && typeof testnetPrivateKey === 'string') {
            this.providerTestnet = new JsonRpcProvider(testnetRpc as string);
            this.walletTestnet = new Wallet(testnetPrivateKey, this.providerTestnet);
            this.signerTestnet = new EthersSigner(this.walletTestnet);

            const anchorAddress = eqtyCore.AnchorClient.contractAddress(this.TESTNET_CHAIN_ID);
            const contract = new Contract(anchorAddress, eqtyCore.AnchorClient.ABI, this.walletTestnet);
            this.anchorClientTestnet = new eqtyCore.AnchorClient(contract);

            this.logger.log(`Initialized Base Sepolia: ${this.walletTestnet.address}`);
        } else {
            this.logger.warn('No testnet private key configured for EQTY');
        }
    }

    /**
     * Safe config getter that handles unknown paths
     */
    private getConfigSafe(path: string): any {
        try {
            return (this.config as any).get(path);
        } catch {
            return undefined;
        }
    }

    /**
     * Get the network ID for a given network type
     */
    public getNetworkId(networkType: 'mainnet' | 'testnet'): number {
        return networkType === 'mainnet' ? this.MAINNET_CHAIN_ID : this.TESTNET_CHAIN_ID;
    }

    /**
     * Get the wallet address for a given network
     */
    public getAddress(networkType: 'mainnet' | 'testnet'): string {
        const wallet = networkType === 'mainnet' ? this.walletMainnet : this.walletTestnet;
        return wallet?.address ?? '';
    }

    /**
     * Create a new EventChain
     */
    public createEventChain(networkType: 'mainnet' | 'testnet', creatorAddress?: string): any {
        const networkId = this.getNetworkId(networkType);
        const address = creatorAddress || this.getAddress(networkType);

        const chain = eqtyCore.EventChain.create(address, networkId);
        this.logger.debug(`Created EventChain for ${address} on network ${networkId}`);

        return chain;
    }

    /**
     * Create and add an event to a chain
     */
    public createEvent(data: any, mediaType: string = 'application/json'): any {
        return new eqtyCore.Event(data, mediaType);
    }

    /**
     * Sign an event with the server wallet
     */
    public async signEvent(event: any, networkType: 'mainnet' | 'testnet'): Promise<any> {
        const signer = networkType === 'mainnet' ? this.signerMainnet : this.signerTestnet;

        if (!signer) {
            throw new Error(`No signer configured for ${networkType}`);
        }

        await event.signWith(signer);
        return event;
    }

    /**
     * Add an event to a chain and sign it
     */
    public async addEventToChain(
        chain: any,
        data: any,
        networkType: 'mainnet' | 'testnet',
        mediaType: string = 'application/json'
    ): Promise<any> {
        const event = new eqtyCore.Event(data, mediaType);
        event.addTo(chain);
        await this.signEvent(event, networkType);
        return event;
    }

    /**
     * Anchor an EventChain to the blockchain
     */
    public async anchorChain(
        chain: any,
        networkType: 'mainnet' | 'testnet'
    ): Promise<TransactionResponse> {
        const client = networkType === 'mainnet'
            ? this.anchorClientMainnet
            : this.anchorClientTestnet;

        if (!client) {
            throw new Error(`No anchor client configured for ${networkType}`);
        }

        const anchorMap = chain.anchorMap;
        this.logger.debug(`Anchoring ${anchorMap.length} entries to ${networkType}`);

        const tx = await client.anchor(anchorMap);
        this.logger.log(`Anchored chain to ${networkType}: ${tx?.hash || 'pending'}`);

        return tx;
    }

    /**
     * Anchor a single hash to the blockchain
     */
    public async anchorHash(
        hash: Uint8Array,
        networkType: 'mainnet' | 'testnet'
    ): Promise<TransactionResponse> {
        const client = networkType === 'mainnet'
            ? this.anchorClientMainnet
            : this.anchorClientTestnet;

        if (!client) {
            throw new Error(`No anchor client configured for ${networkType}`);
        }

        const tx = await client.anchor(hash);
        this.logger.log(`Anchored hash to ${networkType}: ${tx?.hash || 'pending'}`);

        return tx;
    }

    /**
     * Get the current ETH fee per anchor
     * @param networkType Network to query
     * @returns ETH amount in wei required per anchor
     */
    public async getAnchorEthFee(networkType: 'mainnet' | 'testnet'): Promise<bigint> {
        const client = networkType === 'mainnet'
            ? this.anchorClientMainnet
            : this.anchorClientTestnet;

        if (!client) {
            throw new Error(`No anchor client configured for ${networkType}`);
        }

        return client.getEthFee();
    }

    /**
     * Preview total ETH cost for anchoring a chain
     * @param chain The event chain to anchor
     * @param networkType Network to query
     * @returns Total ETH required in wei
     */
    public async previewAnchorCost(
        chain: any,
        networkType: 'mainnet' | 'testnet'
    ): Promise<bigint> {
        const client = networkType === 'mainnet'
            ? this.anchorClientMainnet
            : this.anchorClientTestnet;

        if (!client) {
            throw new Error(`No anchor client configured for ${networkType}`);
        }

        const numAnchors = chain.anchorMap?.length ?? 1;
        return client.previewEthCost(numAnchors);
    }

    /**
     * Anchor an EventChain to the blockchain with ETH payment
     * ETH is forwarded to the RedeemEQTY contract
     * @param chain The event chain to anchor
     * @param networkType Network to use
     * @returns Transaction response
     */
    public async anchorChainWithEth(
        chain: any,
        networkType: 'mainnet' | 'testnet'
    ): Promise<TransactionResponse> {
        const client = networkType === 'mainnet'
            ? this.anchorClientMainnet
            : this.anchorClientTestnet;

        if (!client) {
            throw new Error(`No anchor client configured for ${networkType}`);
        }

        const anchorMap = chain.anchorMap;
        const ethCost = await client.previewEthCost(anchorMap.length);

        this.logger.debug(`Anchoring ${anchorMap.length} entries with ${ethCost} wei ETH to ${networkType}`);

        const tx = await client.anchor(anchorMap, { ethValue: ethCost });
        this.logger.log(`Anchored chain with ETH to ${networkType}: ${tx?.hash || 'pending'}`);

        return tx;
    }

    /**
     * Convert LTO network ID to EQTY network type
     * 'L' = mainnet, 'T' = testnet
     */
    public ltoNetworkToEqty(ltoNetworkId: 'L' | 'T'): 'mainnet' | 'testnet' {
        return ltoNetworkId === 'L' ? 'mainnet' : 'testnet';
    }

    /**
     * Get wallet balance on the network
     */
    public async getBalance(networkType: 'mainnet' | 'testnet'): Promise<bigint> {
        const provider = networkType === 'mainnet' ? this.providerMainnet : this.providerTestnet;
        const address = this.getAddress(networkType);

        if (!provider || !address) {
            throw new Error(`Provider not configured for ${networkType}`);
        }

        return provider.getBalance(address);
    }

    /**
     * Check if an Ethereum address is valid
     */
    public isValidAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Get the signer for a given network (for external use, e.g. Message signing)
     */
    public getSigner(networkType: 'mainnet' | 'testnet'): EthersSigner | null {
        return networkType === 'mainnet' ? this.signerMainnet : this.signerTestnet;
    }

    /**
     * Create a new Message for peer-to-peer communication
     * @param content The message content (string, Buffer, or object)
     * @param mediaType Optional media type (defaults based on content type)
     */
    public createMessage(content: string | Uint8Array | object, mediaType?: string): IMessage {
        return this.factory.createMessage(content, mediaType);
    }

    /**
     * Sign a message with the server wallet and set recipient
     * @param message The message to sign
     * @param recipient Ethereum address of the recipient
     * @param networkType Network to use for signing
     */
    public async signMessage(
        message: any,
        recipient: string,
        networkType: 'mainnet' | 'testnet'
    ): Promise<any> {
        const signer = this.getSigner(networkType);

        if (!signer) {
            throw new Error(`No signer configured for ${networkType}`);
        }

        if (!this.isValidAddress(recipient)) {
            throw new Error(`Invalid recipient address: ${recipient}`);
        }

        message.to(recipient);
        await message.signWith(signer);

        return message;
    }

    /**
     * Create a Relay instance for sending/receiving messages
     * @param url The relay server URL (optional, uses config if not provided)
     */
    public createRelay(url?: string): IRelay {
        const relayUrl = url || this.getConfigSafe('eqty.relayUrl') || 'https://relay.eqty.io';
        return this.factory.createRelay(relayUrl);
    }

    /**
     * Send a signed message via relay
     * @param message The signed message
     * @param relayUrl Optional relay URL
     */
    public async sendViaRelay(message: any, relayUrl?: string): Promise<any> {
        if (!message.isSigned || !message.isSigned()) {
            throw new Error('Message must be signed before sending');
        }

        const relay = this.createRelay(relayUrl);
        return relay.send(message);
    }

    /**
     * Create, sign, and send a message in one operation
     * @param content Message content
     * @param recipient Ethereum address of recipient
     * @param networkType Network for signing
     * @param relayUrl Optional relay URL
     */
    public async createAndSendMessage(
        content: string | Uint8Array | object,
        recipient: string,
        networkType: 'mainnet' | 'testnet',
        relayUrl?: string,
        mediaType?: string
    ): Promise<{ message: any; hash: string }> {
        const message = this.createMessage(content, mediaType);
        await this.signMessage(message, recipient, networkType);

        await this.sendViaRelay(message, relayUrl);

        return {
            message,
            hash: message.hash?.base58 || message.hash?.hex || ''
        };
    }
}
