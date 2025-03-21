import { Module } from '@nestjs/common';
import { FileManagementService } from './file-management.service';
import { IpfsModule } from '../ipfs/ipfs.module';
import { LoggingModule } from '../logging/logging.module';
import { LoggingService } from '../logging/logging.service';
import { S3Module } from '../s3/s3.module';
@Module({
	imports: [
		IpfsModule,
		LoggingModule,
		S3Module
	],
	providers: [FileManagementService, LoggingService],
	exports: [FileManagementService]  // Make sure to export it!
})
export class FileManagementModule {}