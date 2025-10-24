import { IsOptional, IsNumber, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class InputUploadFileDto {
  // Add any existing fields your API already accepts here

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  readonly templateId?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsNumber()
  nummer?: number;

  // Add the signed transaction field
  @IsOptional()
  signedTransaction?: any;
}
