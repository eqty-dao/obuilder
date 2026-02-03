import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { NFTService } from '../../nft/nft.service';
import { EqtyService } from '../../eqty/eqty.service';
import { QueueService } from '../../queue/queue.service';
import { CoinmarketcapService } from '../../coinmarketcap/coinmarketcap.service';
import { LoggingService } from '../../logging/logging.service';
import { NftInfo } from '../../interfaces/OwnableInfo';
import { TypedPackage } from '../../interfaces/TypedPackage';
import { writeFileSync, readFileSync } from 'fs';
import { Blob } from 'buffer';

/**
 * OwnableBuilderService
 *
 * Handles Ownable creation: NFT minting, event chains, and IPFS pinning.
 * This is the EVM-native (Base blockchain) implementation.
 *
 * Note: LTO Network no longer exists - all operations use Base blockchain.
 */
@Injectable()
export class OwnableBuilderService {
    private readonly logger = new Logger(OwnableBuilderService.name);
    private nodeVersion = process.version;

    constructor(
        private readonly config: ConfigService,
        private readonly nft: NFTService,
        private readonly eqtyService: EqtyService,
        private readonly queueService: QueueService,
        private readonly coinmarketcap: CoinmarketcapService,
        private readonly loggingService: LoggingService,
    ) { }

    /**
     * Get template cost for a given template ID
     * Currently only Template ID 1 is supported
     */
    public async getTemplateCost(templateId: number): Promise<any> {
        if (templateId !== 1) {
            throw new Error(`Currently only Template ID 1 is supported`);
        }

        await this.coinmarketcap.getLatestPrice();

        const mainCost = this.queueService.getTemplateCosts('L', 'arbitrum', '1');
        const testCost = this.queueService.getTemplateCosts('T', 'arbitrum', '1');

        this.logger.debug(`Template cost main: ${JSON.stringify(mainCost)}`);
        this.logger.debug(`Template cost test: ${JSON.stringify(testCost)}`);

        return {
            L: { arbitrum: mainCost },
            T: { arbitrum: testCost },
        };
    }

    /**
     * Mint a new NFT for an Ownable
     * @param ltoNetworkId Network identifier (L=mainnet, T=testnet)
     * @param jsonFile JSON with NFT metadata
     * @param requestId Request ID for logging
     */
    public async mintNewNft(
        ltoNetworkId: 'L' | 'T',
        jsonFile: any,
        requestId: string,
    ): Promise<NftInfo> {
        const nftNetwork = jsonFile.NFT_BLOCKCHAIN;
        const nftContractAddress =
            ltoNetworkId === 'L'
                ? this.config.get(`eth.contracts.${nftNetwork}.mainnet`)
                : this.config.get(`eth.contracts.${nftNetwork}.testnet`);

        const nftReceiverAddress =
            ltoNetworkId === 'L'
                ? this.config.get('eth.account.obridge_wallet_address.mainnet')
                : this.config.get('eth.account.obridge_wallet_address.testnet');

        const nftTokenURI = jsonFile.NFT_TOKEN_URI;

        this.loggingService.log(requestId, `nftOwner ${nftReceiverAddress}`);
        this.loggingService.log(requestId, `nftTokenURI ${nftTokenURI}`);
        this.loggingService.log(requestId, `NFT_BLOCKCHAIN ${nftNetwork}`);

        const nftInfo: NftInfo = {
            network: nftNetwork,
            address: nftContractAddress,
            id: 0, // id is set after minting
        };

        try {
            const nftId = await this.nft.mintNFT(
                ltoNetworkId,
                nftReceiverAddress,
                nftTokenURI,
                nftInfo,
            );
            this.loggingService.log(requestId, `NFT minted with id ${nftId}`);
            nftInfo.id = nftId;
            return nftInfo;
        } catch (err) {
            this.loggingService.logError(requestId, `Minting new NFT failed: ${err}`);
            throw err;
        }
    }

    /**
     * Get network type from configuration
     */
    public getNetworkType(): 'mainnet' | 'testnet' {
        const useMainnet = this.config.get('eqty.useMainnet');
        return useMainnet ? 'mainnet' : 'testnet';
    }

    /**
     * Create an event chain for Base blockchain
     * @param pkg The ownable package
     * @param nftInfo NFT information
     * @param receiver Ethereum address (0x...) of the receiver
     * @param networkType 'mainnet' for Base, 'testnet' for Base Sepolia
     */
    public async createEventChainBase(
        pkg: TypedPackage,
        nftInfo: NftInfo,
        receiver: string,
        networkType: 'mainnet' | 'testnet' = 'testnet',
        pathToCids: string,
    ): Promise<Buffer> {
        // Validate Ethereum address
        if (!this.eqtyService.isValidAddress(receiver)) {
            throw new Error(
                `Invalid Ethereum address: ${receiver}. Expected 0x-prefixed hex address.`,
            );
        }

        const chain = this.eqtyService.createEventChain(networkType);
        const chainId = chain.id;
        const networkId = this.eqtyService.getNetworkId(networkType);
        let buf: Buffer;

        if (pkg.isDynamic) {
            // Build instantiate message
            const msg: any = {
                '@context': 'instantiate_msg.json',
                ownable_id: chainId,
                package: pkg.cid,
                network_id: networkId,
                keywords: pkg.keywords,
            };

            // Add NFT info if available
            if (nftInfo.id !== 0) {
                msg.nft = {
                    network: nftInfo.network,
                    id: nftInfo.id.toString(),
                    address: nftInfo.address,
                };
            }

            // Create and sign instantiate event
            await this.eqtyService.addEventToChain(chain, msg, networkType);

            // Create and sign transfer event
            await this.eqtyService.addEventToChain(
                chain,
                { '@context': 'execute_msg.json', transfer: { to: receiver } },
                networkType,
            );

            // Anchor to Base blockchain
            try {
                await this.eqtyService.anchorChain(chain, networkType);
                this.loggingService.log(pkg.cid, `Anchored event chain to Base ${networkType}`);
            } catch (err) {
                this.loggingService.logError(pkg.cid, `Anchoring to Base failed: ${err}`);
                throw err;
            }

            // Validate chain
            await chain.validate();
            this.loggingService.log(pkg.cid, `Event chain validated for Base ${networkType}`);

            // Serialize chain to JSON file
            const jsonPath = `${pathToCids}/${pkg.cid}/${pkg.cid}.json`;
            try {
                writeFileSync(jsonPath, JSON.stringify(chain.toJSON()));
            } catch (err) {
                this.loggingService.logError(pkg.cid, `Writing ${jsonPath} failed`);
                throw err;
            }

            // Read back as buffer
            try {
                const file = readFileSync(jsonPath, { encoding: 'utf8' });
                buf = Buffer.from(file, 'utf8');
            } catch (err) {
                this.loggingService.logError(pkg.cid, `Reading ${jsonPath} failed`);
                throw err;
            }

            this.loggingService.log(
                pkg.cid,
                `Successfully created event chain for Base ${networkType}`,
            );
        }

        return buf;
    }

    /**
     * Pin file to IPFS via Pinata
     * @param picture Buffer containing the image
     * @param name Name for the NFT
     * @param description Description for the NFT
     */
    public async createPinataPinnedFile(
        picture: Buffer,
        name: string,
        description: string,
    ): Promise<string> {
        const JWT = this.config.get('pinata.jwt');
        const pinataGateway = this.config.get('pinata.gateway');

        const pinataMetadata = JSON.stringify({ name: 'PictureNFT' });
        const pinataOptions = JSON.stringify({ cidVersion: 1 });

        const blobPicture = new Blob([picture]);
        const formData = new FormData();

        // Handle different Node.js versions
        if (this.nodeVersion.startsWith('v18.')) {
            formData.append('file', blobPicture as any);
        } else {
            const fileBlob = new File([blobPicture as any], 'OwnableNftPicture', {
                type: 'image/webp',
            });
            formData.append('file', fileBlob);
        }

        formData.append('pinataMetadata', pinataMetadata);
        formData.append('pinataOptions', pinataOptions);

        // Upload picture
        let pictureResponse: any;
        try {
            const request = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                method: 'POST',
                headers: { Authorization: `Bearer ${JWT}` },
                body: formData,
            });
            pictureResponse = await request.json();
        } catch (err) {
            this.logger.error(`Failed to pin picture to IPFS: ${err}`);
            throw err;
        }

        const pictureUrl = `${pinataGateway}/ipfs/${pictureResponse.IpfsHash}`;

        // Create and upload metadata JSON
        const nftMetadata = {
            name,
            description,
            image: pictureUrl,
        };

        const jsonBlob = new Blob([JSON.stringify(nftMetadata)], {
            type: 'application/json',
        });
        const jsonFormData = new FormData();

        if (this.nodeVersion.startsWith('v18.')) {
            jsonFormData.append('file', jsonBlob as any);
        } else {
            const jsonFileBlob = new File([jsonBlob as any], 'metadata.json', {
                type: 'application/json',
            });
            jsonFormData.append('file', jsonFileBlob);
        }

        jsonFormData.append('pinataMetadata', JSON.stringify({ name: 'NFT Metadata' }));
        jsonFormData.append('pinataOptions', pinataOptions);

        let metadataResponse: any;
        try {
            const request = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                method: 'POST',
                headers: { Authorization: `Bearer ${JWT}` },
                body: jsonFormData,
            });
            metadataResponse = await request.json();
        } catch (err) {
            this.logger.error(`Failed to pin metadata to IPFS: ${err}`);
            throw err;
        }

        return `${pinataGateway}/ipfs/${metadataResponse.IpfsHash}`;
    }
}
