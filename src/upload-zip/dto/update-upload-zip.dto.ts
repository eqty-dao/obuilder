import { PartialType } from '@nestjs/swagger';
import { CreateUploadZipDto } from './create-upload-zip.dto';

export class UpdateUploadZipDto extends PartialType(CreateUploadZipDto) {}
