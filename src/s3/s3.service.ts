import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3, CreateBucketCommand, HeadBucketCommand, PutObjectCommand} from '@aws-sdk/client-s3';
import S3Bucket from 'any-bucket/s3';
import { ConfigService } from '../config/config.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

@Injectable()
export class S3Service implements OnModuleInit {
    private s3Client: S3;
    public s3BucketQueue_L: S3Bucket;
    public s3BucketQueue_T: S3Bucket;
    public s3BucketLogs: S3Bucket;

    constructor(
        private readonly config: ConfigService,
        private readonly telegramService: TelegramBotService
    ) {
        const s3LocalConfig = {
            endpoint: 'http://localhost:4566', // LocalStack endpoint
            forcePathStyle: true, // Required for local testing
            credentials: {
                accessKeyId: 'TESTKEY', // Dummy key
                secretAccessKey: 'TESTSECRET' // Dummy secret
            },
            region: 'eu-west-1'
        };
        const localTesting = this.config.get('bucket.localTesting');
        // const localTesting = config.get('LOCAL_TESTING');
        if (localTesting) {            
            this.s3Client = new S3(s3LocalConfig); // FOR TESTING ONLY

        } else {
            this.s3Client = new S3({ region: 'eu-west-1' });

        }
        this.s3BucketQueue_L = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.queue.mainnet'));
        this.s3BucketQueue_T = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.queue.testnet'));
        this.s3BucketLogs = new S3Bucket(this.s3Client, this.config.get('bucket.obuilder.logs'));

    }
    
    async onModuleInit() {
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: this.config.get('bucket.obuilder.queue.mainnet') }));
            console.log(`Mainnet Bucket already exists.`);
        } catch (err) {
            if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
                console.log(`Mainnet Bucket does not exist. Creating it now.`);
                await this.s3Client.send(new CreateBucketCommand({ Bucket: this.config.get('bucket.obuilder.queue.mainnet') }));
                // await this.updateQueueInS3Bucket('L');
            } else {
                console.error('Error checking mainnet bucket existence:', err);
                return; // Exit early if there's a non-not-found error
            }
        }
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: this.config.get('bucket.obuilder.queue.testnet') }));
            console.log(`Testnet Bucket already exists.`);
        } catch (err) {
            if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
                console.log(`Testnet Bucket does not exist. Creating it now.`);
                await this.s3Client.send(new CreateBucketCommand({ Bucket: this.config.get('bucket.obuilder.queue.testnet') }));
                // await this.updateQueueInS3Bucket('T');
            } else {
                console.error('Error checking testnet bucket existence:', err);
                return; // Exit early if there's a non-not-found error
            }
        }

    }

	public async uploadPictureToS3(picture: Buffer): Promise<string> {	

		const bucketName = this.config.get('bucket.obuilder.pinata.mainnet');
		const objectKey1 = `image/${Date.now()}.webp`; // Unique file key in S3
	
		try {
			// Upload picture to S3
			const command1 = new  PutObjectCommand({
				Bucket: bucketName,
				Key: objectKey1,
				Body: picture,
				ContentType: "image/webp", // Adjust if picture type differs
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
				ContentType: "application/json", // Content type for JSON files
			});
			await this.s3Client.send(command2);

			// Return the public URL (assumes bucket is public or uses CloudFront)
			return `https://${bucketName}.s3.eu-west-1.amazonaws.com/${objectKey2}`;
		} catch (error) {
			console.error("Error uploading to S3:", error);
			throw new Error("Failed to upload picture to S3");
		}
	}
}
