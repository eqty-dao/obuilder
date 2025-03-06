import { Module } from '@nestjs/common';
import { FileManagementService } from './file-management.service';
import { IpfsModule } from 'src/ipfs/ipfs.module';

@Module({
	imports: [
		IpfsModule
	],
	providers: [FileManagementService],
	exports: [FileManagementService]  // Make sure to export it!
})
export class FileManagementModule {}