import { Controller, Get, Header, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, ParseIntPipe, Res, Query, StreamableFile } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
// import { CreateUploadZipDto } from './dto/create-upload-zip.dto';
import { UpdateUploadZipDto } from './dto/update-upload-zip.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { InputUploadFileDto } from './dto/inputUploadFileDto.dto';
import { Account, EventChain } from '@ltonetwork/lto';
import { Signer } from '../common/http-signature/signer';
import { createReadStream } from 'fs';

@Controller('api/v1')
export class UploadZipController {
  constructor(private readonly uploadZipService: UploadZipService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@Body() inputUploadFile: InputUploadFileDto, @UploadedFile() file: Express.Multer.File, @Signer() signer?: Account,) {
    console.log("file.fieldname", file.fieldname);
    console.log("file.originalname", file.originalname);
    // console.log("inputUploadFile.name", inputUploadFile.name);
    // console.log("inputUploadFile.id", inputUploadFile.id);
    // console.log("inputUploadFile.nummer", inputUploadFile.nummer);
    // console.log("file.buffer",file.buffer);
    const buffer = file.buffer;
    if (!buffer || Object.getPrototypeOf(buffer) === null || Object.prototype.isPrototypeOf(buffer) == false) {
      //return res.status(400).send('Failed to read data from HTTP request');
      throw ('Failed to read data from HTTP request');
    }

    let requestId: string;
    try {
      requestId = await this.uploadZipService.store(buffer, 1, signer, true); // 1 == template 1 => TODO: make this a POST input variable for future
      return {
        REQUEST_ID: requestId, // res.status(201).json({ file: file.originalname })
      }

    } catch (e) {
      return { "error": `${e}` };
    }

  }

  // @Get('CIDs')
  // async getCIDs() {
  //   try {
  //     return await this.uploadZipService.getCIDs();
  //   } catch (e) {
  //     return { "error": `${e}` };
  //   }
  // }

  @Get('isRelayServerUp')
  async isRelayServerUp() {
    try {
      return await this.uploadZipService.isRelayServerUp();
    } catch (e) {
      return { error: `${e}` };
    }
  }
  @Get('isEVMAddress')
  isEVMAddress(@Param('address') address: string) {
    try {
      return this.uploadZipService.isEVMAddress(address);      
    } catch (e) {
      return { error: `${e}` };
    }
  }
  
  @Get('availableChains')
  async GetAvailableNftChains() {
    try {
      return await this.uploadZipService.getAvailableNftChains();
    } catch (e) {
      return { error: `${e}` };
    }
  }
  @Get('requestIDs')
  async getRequestIDs(@Query('ltoUserAddress') ltoUserAddress?: string) {

    try {
      return await this.uploadZipService.getClaimableRequestIDs(ltoUserAddress)
    } catch (e) {
      return { "error": `${e}` };
    }

  }
  //needs additional Query parameter to get different costs for template 1,2,3...
  @Get('templateCost')
  templateCost(@Query('templateId') templateId: number) {
    try {
      return this.uploadZipService.templateCost(templateId);
    } catch (e) {
      return { "error": `${e}` };
    }
  }

  @Get('claim/')
  @Header('Content-type', 'application/zip')
  async claim(
    @Query('requestId') requestId: string,
    @Signer() signer?: Account,
  ): Promise<StreamableFile> {
    return await this.uploadZipService.claim(requestId, signer);
  }

  @Get('ServerWalletAddressLTO')
  serverWalletAddressLTO() {
    try {
      return { "serverWalletAddressLTO": `${this.uploadZipService.getServerLTOwalletAddress()}` }
    } catch (e) {
      return { "error": `${e}` };
    }
  }

  @Get('GetServerInfo')
  async GetServerInfo() {
    try {
      const [balanceETH, balanceARB] = await this.uploadZipService.GetServerETHBalance();
      const balanceLTO = await this.uploadZipService.getLTOAccountBalance();
      const serverLTOwallet = this.uploadZipService.getServerLTOwalletAddress()
      // console.log("balance", balance);
      return {
        "ServerBalanceETH": balanceETH,
        "ServerBalanceARB": balanceARB,
        "ServerBalanceLTO": balanceLTO,
        "serverLTOwalletAddress": serverLTOwallet
      };
    } catch (e) {
      return { "error": `${e}` };
    }
  }

  // @Get()
  // findAll() {
  //   return this.uploadZipService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id', ParseIntPipe) id: number) {
  //   return this.uploadZipService.findOne(id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateUploadZipDto: UpdateUploadZipDto) {
  //   return this.uploadZipService.update(+id, updateUploadZipDto);
  // }

  // @Delete(':id')
  // remove(@Param('id', ParseIntPipe) id: number) {
  //   return this.uploadZipService.remove(id);
  // }
}
