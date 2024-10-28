// import {
//   Controller,
//   Post,
//   Body,
//   UseInterceptors,
//   UploadedFile,
//   Res,
// } from '@nestjs/common';
// import { UploadZipService } from './upload-zip.service';
// // import { CreateUploadZipDto } from './dto/create-upload-zip.dto';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { Express } from 'express';
// import { Response } from 'express';
// import { InputUploadFileDto } from './dto/inputUploadFileDto.dto';
// import { Account } from '@ltonetwork/lto';
// import { Signer } from '../common/http-signature/signer';
// import { AuthError, UserError, DataError } from '../interfaces/error';
// import { ApiTags } from '@nestjs/swagger';

// @ApiTags('Build')
// @Controller('upload')
// export class UploadZipController {
//   constructor(private readonly uploadZipService: UploadZipService) {}

//   @Post('')
//   @UseInterceptors(FileInterceptor('file'))
//   async uploadFile(
//     @Body() inputUploadFile: InputUploadFileDto,
//     @UploadedFile() file: Express.Multer.File,
//     @Res() res: Response,
//     @Signer() signer?: Account,
//   ): Promise<Response> {
//     console.log('file.fieldname', file.fieldname);
//     console.log('file.originalname', file.originalname);
//     // console.log("inputUploadFile.name", inputUploadFile.name);
//     // console.log("inputUploadFile.id", inputUploadFile.id);
//     // console.log("inputUploadFile.nummer", inputUploadFile.nummer);
//     // console.log("file.buffer",file.buffer);
//     const buffer = file.buffer;
//     if (
//       !buffer ||
//       Object.getPrototypeOf(buffer) === null ||
//       Object.prototype.isPrototypeOf(buffer) == false
//     ) {
//       return res.status(400).send('Failed to read data from HTTP request');
//     }

//     let requestId: string;
//     try {
//       requestId = await this.uploadZipService.queueRequest(
//         buffer,
//         1,
//         signer,
//         true,
//       );
//       // requestId = await this.uploadZipService.store(buffer, 1, signer, true); // 1 == template 1 => TODO: make this a POST input variable for future
//       return res.status(201).json(requestId);
//     } catch (err) {
//       return this.errorResponse(res, err);
//     }
//   }

//   private errorResponse(res: Response, err: any) {
//     if (err instanceof AuthError) return res.status(403); //.status(403).send(err.message);
//     if (err instanceof UserError) return res.status(400).send(err.message);
//     if (err instanceof DataError) return res.status(404).send(err.message);
//     return res.status(500).send(`Unexpected error: ${err.message}`);
//   }
// }

import {
  Controller,
  Post,
  UploadedFile,
  Res,
  Body,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UploadZipService } from './upload-zip.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Signer } from '../common/http-signature/signer';
import { Account } from '@ltonetwork/lto';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Build')
@Controller('upload')
export class UploadZipController {
  constructor(private readonly uploadZipService: UploadZipService) {}

  @Post('')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Body() inputUploadFile: any,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
    @Signer() signer?: Account,
  ) {
    try {
      const buffer = file.buffer;
      if (!buffer) {
        return res.status(400).send('Failed to read data from HTTP request');
      }
      const requestId = 'req_' + uuidv4();

      // Process the request - send to RabbitMQ and set initial Redis status

      await this.uploadZipService.processRequest(
        requestId,
        buffer,
        signer.address,
      );

      // Send back requestId for tracking
      return res.status(201).json({ requestId });
    } catch (err) {
      return res.status(500).send(`Unexpected error: ${err.message}`);
    }
  }
}
