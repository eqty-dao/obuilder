import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3, CreateBucketCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import S3Bucket from 'any-bucket/s3';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

/**
 * Mock S3Bucket for local testing without LocalStack
 */
class MockS3Bucket {
    private storage: Map<string, Buffer> = new Map();
    private logger = new Logger('MockS3Bucket');

    constructor(private bucketName: string) {
        this.logger.debug(`Created mock bucket: ${bucketName}`);
    }

    async put(key: string, data: string | Buffer | Uint8Array): Promise<void> {
        const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
        this.storage.set(key, buffer);
        this.logger.debug(`[Mock] Stored ${key} (${buffer.length} bytes)`);
    }

    async get(key: string): Promise<Buffer> {
        const data = this.storage.get(key);
        if (!data) {
            throw new Error(`[Mock] Key not found: ${key}`);
        }
        return data;
    }

    async delete(key: string): Promise<void> {
        this.storage.delete(key);
    }

    async has(key: string): Promise<boolean> {
        return this.storage.has(key);
    }

    async list(): Promise<string[]> {
        return Array.from(this.storage.keys());
    }
}

@Injectable()
export class S3Service implements OnModuleInit {
    private readonly logger = new Logger(S3Service.name);
    private s3Client: S3;
    public s3BucketQueue_L: S3Bucket | MockS3Bucket;
    public s3BucketQueue_T: S3Bucket | MockS3Bucket;
    public s3BucketLogs: S3Bucket | MockS3Bucket;
    public s3BucketOwnables_L: S3Bucket | MockS3Bucket;
    public s3BucketOwnables_T: S3Bucket | MockS3Bucket;
    private initialized = false;
    private initPromise: Promise<void> | null = null;
    private localTesting = false;

    constructor(
        private readonly config: ConfigService,
        private readonly telegramService: TelegramBotService
    ) {
        // Note: Config-dependent initialization moved to init()
        // to ensure ConfigService has loaded before we access it
    }

    async onModuleInit() {
        // Start initialization but don't wait for bucket checks
        await this.init();
    }

    /**
     * Initialize S3 service - can be called multiple times safely
     */
    private async init(): Promise<void> {
        if (this.initialized) return;

        // If already initializing, wait for that to complete
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInit();
        return this.initPromise;
    }

    private async doInit(): Promise<void> {
        // Ensure config is loaded
        await this.config.load();

        // Check if we're in local testing mode
        this.localTesting = this.config.get('bucket.localTesting');

        if (this.localTesting) {
            this.logger.log('S3Service running in LOCAL TESTING mode - using in-memory mock storage');

            // Use mock S3 buckets for local testing
            this.s3BucketQueue_L = new MockS3Bucket(this.config.get('bucket.obuilder.queue.mainnet'));
            this.s3BucketQueue_T = new MockS3Bucket(this.config.get('bucket.obuilder.queue.testnet'));
            this.s3BucketLogs = new MockS3Bucket(this.config.get('bucket.obuilder.logs'));
            this.s3BucketOwnables_L = new MockS3Bucket(this.config.get('bucket.obuilder.ownables.mainnet'));
            this.s3BucketOwnables_T = new MockS3Bucket(this.config.get('bucket.obuilder.ownables.testnet'));
        } else {
            this.s3Client = new S3({ region: 'eu-west-1' });
            this.logger.log('S3Service initialized with AWS S3');

            // Initialize real bucket wrappers
            this.s3BucketQueue_L = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.queue.mainnet'));
            this.s3BucketQueue_T = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.queue.testnet'));
            this.s3BucketLogs = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.logs'));
            this.s3BucketOwnables_L = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.ownables.mainnet'));
            this.s3BucketOwnables_T = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.ownables.testnet'));

            // Ensure buckets exist in production
            try {
                await this.ensureBucketExists('bucket.obuilder.queue.mainnet', 'Mainnet Queue');
                await this.ensureBucketExists('bucket.obuilder.queue.testnet', 'Testnet Queue');
                await this.ensureBucketExists('bucket.obuilder.ownables.mainnet', 'Mainnet Ownables');
                await this.ensureBucketExists('bucket.obuilder.ownables.testnet', 'Testnet Ownables');
                await this.ensureBucketExists('bucket.obuilder.logs', 'Logs');
            } catch (err) {
                this.logger.warn('Could not verify S3 buckets exist. Continuing anyway...', err);
            }
        }

        this.initialized = true;
    }

    /**
     * Helper to check if bucket exists and create if not
     */
    private async ensureBucketExists(configKey: string, bucketLabel: string): Promise<void> {
        const bucketName = this.config.get(configKey as any);
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
            this.logger.log(`${bucketLabel} Bucket already exists.`);
        } catch (err: any) {
            if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
                this.logger.log(`${bucketLabel} Bucket does not exist. Creating it now.`);
                await this.s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
            } else {
                this.logger.error(`Error checking ${bucketLabel} bucket existence:`, err);
            }
        }
    }

    /**
     * Ensure initialized before any operation
     */
    private async ensureReady(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
    }

    public async checkFileExists(ltoNetworkId: 'L' | 'T', key: string): Promise<boolean> {
        await this.ensureReady();

        // In local testing mode, check mock storage
        if (this.localTesting) {
            const bucket = ltoNetworkId === 'L' ? this.s3BucketQueue_L : this.s3BucketQueue_T;
            if (bucket instanceof MockS3Bucket) {
                return bucket.has(key);
            }
            return false;
        }

        try {
            const params = {
                Bucket: ltoNetworkId === 'L'
                    ? this.config.get('bucket.obuilder.queue.mainnet')
                    : this.config.get('bucket.obuilder.queue.testnet'),
                Key: key,
            };

            // Attempt to fetch the object's metadata
            await this.s3Client.send(new HeadObjectCommand(params));
            this.logger.debug(`File exists: ${key}`);
            return true; // File exists
        } catch (error: any) {
            if (error.name === 'NotFound') {
                this.logger.debug(`File does not exist: ${key}`);
                return false; // File does not exist
            }
            // Handle other potential errors
            this.logger.error('Error checking file existence:', error);
            throw error;
        }
    }

    public async storeZip(ltoNetworkId: 'L' | 'T', cid: string, rid: string, sender: string, zipContent: Uint8Array): Promise<void> {
        await this.ensureReady();
        const key = `${rid}_${cid}_${sender}_.zip`;

        try {
            if (ltoNetworkId === 'L') {
                await this.s3BucketOwnables_L.put(key, zipContent);
            } else {
                await this.s3BucketOwnables_T.put(key, zipContent);
            }
            this.logger.log(`Stored zip: ${key}`);
        } catch (err) {
            throw new Error(`Putting ${key} into s3 Bucket failed for LTO network ${ltoNetworkId}. Error: ${err}`);
        }
    }

    public async uploadPictureToS3(picture: Buffer): Promise<string> {
        await this.ensureReady();
        const bucketName = this.config.get('bucket.obuilder.pinata.mainnet');
        const objectKey1 = `image/${Date.now()}.webp`;

        // In local testing mode, just return a mock URL
        if (this.localTesting) {
            this.logger.debug('[Local Testing] Skipping S3 upload, returning mock URL');
            return `https://mock-bucket.s3.eu-west-1.amazonaws.com/json/${Date.now()}.json`;
        }

        try {
            // Upload picture to S3
            const command1 = new PutObjectCommand({
                Bucket: bucketName,
                Key: objectKey1,
                Body: picture,
                ContentType: "image/webp",
            });
            await this.s3Client.send(command1);

            const jsonData = {
                nftImage: `https://${bucketName}.s3.eu-west-1.amazonaws.com/${objectKey1}`
            }

            const objectKey2 = `json/${Date.now()}.json`;
            const jsonString = JSON.stringify(jsonData);

            // Upload JSON string to S3
            const command2 = new PutObjectCommand({
                Bucket: bucketName,
                Key: objectKey2,
                Body: jsonString,
                ContentType: "application/json",
            });
            await this.s3Client.send(command2);

            // Return the public URL
            return `https://${bucketName}.s3.eu-west-1.amazonaws.com/${objectKey2}`;
        } catch (error) {
            this.logger.error('Error uploading to S3:', error);
            throw new Error("Failed to upload picture to S3");
        }
    }
}
