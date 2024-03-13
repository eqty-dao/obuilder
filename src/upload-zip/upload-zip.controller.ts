import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, ParseIntPipe, Res, Query } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { CreateUploadZipDto } from './dto/create-upload-zip.dto';
import { UpdateUploadZipDto } from './dto/update-upload-zip.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { InputUploadFileDto } from './dto/inputUploadFileDto.dto';

@Controller('api/v1')
export class UploadZipController {
  constructor(private readonly uploadZipService: UploadZipService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@Body() inputUploadFile: InputUploadFileDto, @UploadedFile() file: Express.Multer.File) {
    console.log("file.fieldname", file.fieldname);
    console.log("file.originalname", file.originalname);
    // console.log("inputUploadFile.name", inputUploadFile.name);
    // console.log("inputUploadFile.id", inputUploadFile.id);
    // console.log("inputUploadFile.nummer", inputUploadFile.nummer);

    const buffer = file.buffer;
    if (!buffer || Object.getPrototypeOf(buffer) === null || Object.prototype.isPrototypeOf(buffer) == false) {
      //return res.status(400).send('Failed to read data from HTTP request');
      throw ('Failed to read data from HTTP request');
    }
    let requestId;
    try {
      requestId = await this.uploadZipService.store(buffer,true);
      return {
        REQUEST_ID: requestId, // res.status(201).json({ file: file.originalname })
      }

    } catch (e) {
      return { "error": `${e}` };
    }

  }
  // create(@Body() createUploadZipDto: CreateUploadZipDto) {
  //   return this.uploadZipService.create(createUploadZipDto);
  // }

  //needs additional Query parameter to get different costs for template 1,2,3...
  @Get('templateCost')
  templateCost(@Query('template') templateNumber: number) {
    try {
      return {
        "templateCost": `${this.uploadZipService.templateCost(templateNumber)}`,
        "serverWalletAddressLTO": `${this.uploadZipService.getServerLTOwalletAddress()}`
      }
    } catch (e) {
      return { "error": `${e}` };
    }
  }

  @Get('ServerWalletAddressLTO')
  serverWalletAddressLTO() {
    try {
      return this.uploadZipService.getLTOAccountAddress();
    } catch (e) {
      return { "error": `${e}` };
    }
  }

  @Get('GetLTOAccountBalance')
  async getLTOAccountBalance(@Query('address') address?: string) {
    try {
      return await this.uploadZipService.getLTOAccountBalance(address);
    } catch (e) {
      return { "error": `${e}` };
    }
  }

  @Get()
  findAll() {
    return this.uploadZipService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.uploadZipService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUploadZipDto: UpdateUploadZipDto) {
    return this.uploadZipService.update(+id, updateUploadZipDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.uploadZipService.remove(id);
  }
}
