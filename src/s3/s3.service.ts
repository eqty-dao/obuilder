import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  S3,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import S3Bucket from 'any-bucket/s3';
import LocalBucket from 'any-bucket/local';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class S3Service implements OnModuleInit {
  private s3Client: S3;
  private useLocalStorage: boolean;
  public s3BucketQueue_L: any;
  public s3BucketQueue_T: any;
  public s3BucketLogs: any;
  public s3BucketOwnables_L: any;
  public s3BucketOwnables_T: any;

  constructor(
    private readonly config: ConfigService,
    private readonly telegramService: TelegramBotService,
  ) {
    const localTesting = this.config.get('bucket.localTesting');

    if (localTesting) {
      // Use local filesystem storage instead of LocalStack
      this.useLocalStorage = true;
      const storageBasePath = path.join(process.cwd(), 'storage', 's3');

      // Ensure storage directory exists
      if (!fs.existsSync(storageBasePath)) {
        fs.mkdirSync(storageBasePath, { recursive: true });
      }

      // Create local bucket instances
      this.s3BucketQueue_L = new LocalBucket(
        path.join(
          storageBasePath,
          this.config.get('bucket.obuilder.queue.mainnet'),
        ),
      );
      this.s3BucketQueue_T = new LocalBucket(
        path.join(
          storageBasePath,
          this.config.get('bucket.obuilder.queue.testnet'),
        ),
      );
      this.s3BucketLogs = new LocalBucket(
        path.join(storageBasePath, this.config.get('bucket.obuilder.logs')),
      );
      this.s3BucketOwnables_L = new LocalBucket(
        path.join(
          storageBasePath,
          this.config.get('bucket.obuilder.ownables.mainnet'),
        ),
      );
      this.s3BucketOwnables_T = new LocalBucket(
        path.join(
          storageBasePath,
          this.config.get('bucket.obuilder.ownables.testnet'),
        ),
      );
    } else {
      // Use real S3
      this.useLocalStorage = false;
      this.s3Client = new S3({ region: 'eu-west-1' });
      this.s3BucketQueue_L = new S3Bucket(
        this.s3Client,
        this.config.get('bucket.obuilder.queue.mainnet'),
      );
      this.s3BucketQueue_T = new S3Bucket(
        this.s3Client,
        this.config.get('bucket.obuilder.queue.testnet'),
      );
      this.s3BucketLogs = new S3Bucket(
        this.s3Client,
        this.config.get('bucket.obuilder.logs'),
      );
      this.s3BucketOwnables_L = new S3Bucket(
        this.s3Client,
        this.config.get('bucket.obuilder.ownables.mainnet'),
      );
      this.s3BucketOwnables_T = new S3Bucket(
        this.s3Client,
        this.config.get('bucket.obuilder.ownables.testnet'),
      );
    }
  }

  async onModuleInit() {
    if (this.useLocalStorage) {
      // For local storage, directories are created automatically
      console.log('Using local filesystem storage for S3 buckets');
      console.log(`Storage path: ${path.join(process.cwd(), 'storage', 's3')}`);
      return;
    }

    // Initialize S3 buckets in AWS
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.config.get('bucket.obuilder.queue.mainnet'),
        }),
      );
      console.log(`Mainnet Queue Bucket already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        console.log(`Mainnet Queue Bucket does not exist. Creating it now.`);
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.config.get('bucket.obuilder.queue.mainnet'),
          }),
        );
      } else {
        console.error('Error checking mainnet Queue bucket existence:', err);
        return; // Exit early if there's a non-not-found error
      }
    }
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.config.get('bucket.obuilder.queue.testnet'),
        }),
      );
      console.log(`Testnet Queue Bucket already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        console.log(`Testnet Queue Bucket does not exist. Creating it now.`);
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.config.get('bucket.obuilder.queue.testnet'),
          }),
        );
      } else {
        console.error('Error checking testnet Queue bucket existence:', err);
        return; // Exit early if there's a non-not-found error
      }
    }
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.config.get('bucket.obuilder.ownables.mainnet'),
        }),
      );
      console.log(`Mainnet Ownables Bucket already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        console.log(`Mainnet Ownables Bucket does not exist. Creating it now.`);
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.config.get('bucket.obuilder.ownables.mainnet'),
          }),
        );
      } else {
        console.error('Error checking mainnet Ownables bucket existence:', err);
        return; // Exit early if there's a non-not-found error
      }
    }
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.config.get('bucket.obuilder.ownables.testnet'),
        }),
      );
      console.log(`Testnet Ownables Bucket already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        console.log(`Testnet Ownables Bucket does not exist. Creating it now.`);
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.config.get('bucket.obuilder.ownables.testnet'),
          }),
        );
      } else {
        console.error('Error checking testnet Ownables bucket existence:', err);
        return; // Exit early if there's a non-not-found error
      }
    }
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.config.get('bucket.obuilder.logs'),
        }),
      );
      console.log(`Logs Bucket already exists.`);
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        console.log(`Logs Bucket does not exist. Creating it now.`);
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.config.get('bucket.obuilder.logs'),
          }),
        );
      } else {
        console.error('Error checking Logs bucket existence:', err);
        return; // Exit early if there's a non-not-found error
      }
    }
  }
  public async checkFileExists(ltoNetworkId: 'L' | 'T', key) {
    if (this.useLocalStorage) {
      // For local storage, check if file exists directly
      try {
        const bucket =
          ltoNetworkId === 'L' ? this.s3BucketQueue_L : this.s3BucketQueue_T;
        await bucket.get(key);
        console.log(`File exists: ${key}`);
        return true;
      } catch (error) {
        console.log(`File does not exist: ${key}`);
        return false;
      }
    }

    try {
      let params;
      if (ltoNetworkId === 'L') {
        params = {
          Bucket: this.config.get('bucket.obuilder.queue.mainnet'),
          Key: key,
        };
      } else {
        params = {
          Bucket: this.config.get('bucket.obuilder.queue.testnet'),
          Key: key,
        };
      }

      // Attempt to fetch the object's metadata
      await this.s3Client.send(new HeadObjectCommand(params));
      console.log(`File exists: ${key}`);
      return true; // File exists
    } catch (error) {
      if (error.name === 'NotFound') {
        console.log(`File does not exist: ${key}`);
        return false; // File does not exist
      }
      // Handle other potential errors
      console.error('Error checking file existence:', error);
      throw error;
    }
  }
  /**
   * Retrieves a zip file from S3 bucket
   * @param ltoNetworkId Network identifier ('L' for mainnet, 'T' for testnet)
   * @param cid Content identifier
   * @param requestId Request ID
   * @param wallet Wallet address
   * @returns The file content as Uint8Array or null if not found
   */
  public async getZip(
    ltoNetworkId: 'L' | 'T',
    cid: string,
    requestId: string,
    wallet: string,
  ): Promise<Uint8Array | null> {
    const bucket =
      ltoNetworkId === 'L' ? this.s3BucketOwnables_L : this.s3BucketOwnables_T;
    const key = `${cid}_${requestId}_${wallet}_.zip`;

    try {
      const data = await bucket.get(key);
      return data;
    } catch (error) {
      return null;
    }
  }

  public async storeZip(
    ltoNetworkId: 'L' | 'T',
    cid: string,
    rid: string,
    sender: string,
    zipContent: Uint8Array,
  ) {
    try {
      if (ltoNetworkId === 'L') {
        await this.s3BucketOwnables_L.put(
          `${rid}_${cid}_${sender}_.zip`,
          zipContent,
        );
      } else {
        await this.s3BucketOwnables_T.put(
          `${rid}_${cid}_${sender}_.zip`,
          zipContent,
        );
      }
    } catch (err) {
      throw new Error(
        `Putting ${rid}_${cid}_${sender}_.zip into s3 Bucket failed for LTO network ${ltoNetworkId}. Error: ${err}`,
      );
    }
  }
  public async uploadPictureToS3(picture: Buffer): Promise<string> {
    const bucketName = this.config.get('bucket.obuilder.pinata.mainnet');
    const objectKey1 = `image/${Date.now()}.webp`; // Unique file key in S3

    try {
      // Upload picture to S3
      const command1 = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey1,
        Body: picture,
        ContentType: 'image/webp', // Adjust if picture type differs
      });
      await this.s3Client.send(command1);

      const jsonData = {
        nftImage: `https://${bucketName}.s3.eu-west-1.amazonaws.com/${objectKey1}`,
      };

      const objectKey2 = `json/${Date.now()}.json`;
      const jsonString = JSON.stringify(jsonData);

      // Upload JSON string to S3
      const command2 = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey2,
        Body: jsonString,
        ContentType: 'application/json', // Content type for JSON files
      });
      await this.s3Client.send(command2);

      // Return the public URL (assumes bucket is public or uses CloudFront)
      return `https://${bucketName}.s3.eu-west-1.amazonaws.com/${objectKey2}`;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error('Failed to upload picture to S3');
    }
  }
}
