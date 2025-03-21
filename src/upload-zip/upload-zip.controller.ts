import { Controller, Get, Post, Body, UseInterceptors, UploadedFile, Res, Req, Query, HttpException, HttpStatus, Param } from '@nestjs/common';
import { UploadZipService } from './upload-zip.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { Request, Response } from 'express';
import { Account, EventChain } from '@ltonetwork/lto';
import { Signer } from '../common/http-signature/signer';
import { AuthError, UserError, DataError } from '../interfaces/error';
import { QueueEntry, OwnableStatus } from '../interfaces/QueueEntry';
import { } from 'multer';
import { CoinmarketcapService } from '../coinmarketcap/coinmarketcap.service';
import { QueueService } from '../queue/queue.service';
// import { Transform } from 'class-transformer';
import { InputUploadFileDto } from '../dtos/input-upload-file.dto';
import path from 'path';



@Controller('api/v1')
export class UploadZipController {
	constructor(private readonly uploadZipService: UploadZipService,
		private readonly coinmarketcapService: CoinmarketcapService,
		private readonly queueService: QueueService
	) { }

	@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(
  @Body() inputUploadFile: InputUploadFileDto,
  @UploadedFile() file: Express.Multer.File,
  @Req() req: Request,
  @Res() res: Response,
  @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T',
//   @Query('templateId') queryTemplateId?: string,
  @Signer() signer?: Account): Promise<Response> {


		let buffer: Buffer = null;
		console.log("file", file);
		console.log("typeof file", typeof file);

		if (file) {
			console.log("file.fieldname", file.fieldname);
			console.log("file.originalname", file.originalname);
		}

		console.log("buffer", file.buffer);
		console.log("typeof buffer", typeof file.buffer);

		if (Object.getPrototypeOf(file) === null || Object.prototype.isPrototypeOf(file) == false) {
			console.log('The variable is NOT a Buffer object.');
			return res.status(400).send('Failed to read data from HTTP request');

		} else {
			console.log('The variable is a Buffer object.');
			buffer = file.buffer;
		}

		// Process templateId from either query or body
		let templateId: number | undefined;
		console.log("inputUploadFile.templateId", inputUploadFile.templateId);
		if (inputUploadFile.templateId !== undefined) {
			templateId = inputUploadFile.templateId;
			console.log(`Using templateId from body: ${templateId}`);
			if (isNaN(templateId)) {
				return res.status(400).json({ error: "templateId must be a number" });
			}
			const templateExists = await this.uploadZipService.checkTemplateExists(templateId);
			if (!templateExists) {
				return res.status(404).json({ error: "Template not found" });
			}

		} 
		
			
		// Check for a signed transaction in the request body
		if (inputUploadFile.signedTransaction) {
			console.log("Received signed transaction with upload:", inputUploadFile.signedTransaction);
		}

		let requestId: string;
		try {
		  // Pass the signed transaction to queueRequest
		  requestId = await this.uploadZipService.queueRequest(
			ltoNetworkId,
			buffer,
			req,
			templateId,
			inputUploadFile.signedTransaction // Pass the signed transaction directly
		  );
	  
		  return res.status(201).json({
			requestId,
			message: inputUploadFile.signedTransaction 
			  ? "Request queued with payment transaction" 
			  : "Request queued"
		  });
		} catch (err) {
		  return this.errorResponse(res, err);
		}
	}
	
	private errorResponse(res: Response, err: any) {
		if (err instanceof AuthError) return res.status(403) //.status(403).send(err.message);
		if (err instanceof UserError) return res.status(400).send(err.message);
		if (err instanceof DataError) return res.status(404).send(err.message);

		// console.error(err);
		return res.status(500).send(`Unexpected error: ${err.message}`);
	}
	@Get('getLogsByRequestId')
	getLogsByRequestId(@Query('requestId') requestId: string) {
		return this.uploadZipService.getLogsByRequestId(requestId);
	}
	@Get('getInQueueEntries')
	getInQueueEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return this.uploadZipService.getInQueueEntries(ltoNetworkId);
	}
	@Get('getProcessingEntries')
	getProcessingEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return this.uploadZipService.getProcessingEntries(ltoNetworkId);
	}
	@Get('getReadyEntries')
	getReadyEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return this.uploadZipService.getReadyEntries(ltoNetworkId);
	}
	@Get('getSentEntries')
	getSentEntries(@Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return this.uploadZipService.getSentEntries(ltoNetworkId);
	}
	@Get('getQueueEntriesByRequestId')
	getQueueEntriesByRequestId(@Query('requestId') requestId: string, @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return this.uploadZipService.getQueueEntriesByRequestId(ltoNetworkId, requestId);
	}
	@Get('getQueueEntriesByWallet')
	getQueueEntriesByWallet(@Query('wallet') wallet: string) {
		return this.uploadZipService.getQueueEntriesByWallet(wallet.toString());
	}
	@Get('getQueueEntriesByStatus')
	getQueueEntriesByStatus(@Query('status') status: OwnableStatus, @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return this.uploadZipService.getQueueEntriesByStatus(ltoNetworkId, status);
	}

	@Get('resendOwnableByRequestId')
	async resendOwnableByRequestId(@Query('requestId') requestId: string, @Query('ltoNetworkId') ltoNetworkId: 'L' | 'T') {
		return await this.uploadZipService.resendOwnableByRequestId(ltoNetworkId, requestId);
	}

	@Get('getQueueStatus')
	getQueueStatus() {
		const retVal = this.uploadZipService.queueStatus();
		return retVal;
	}

	@Get('isRelayServerUp')
	async isRelayServerUp() {
		try {
			return await this.uploadZipService.isRelayServerUp();
		} catch (err) {
			return { "error": `${err}` };
		}
	}
	@Get('isEVMAddress')
	isEVMAddress(@Query('address') address: string) {
		try {
			return this.uploadZipService.isEVMAddress(address);
		} catch (err) {
			return { "error": `${err}` };
		}
	}
	@Get('isLTOAddress')
	isLTOAddress(@Query('address') address: string) {
		try {
			return this.uploadZipService.isValidLtoAddress(address);
		} catch (err) {
			return false;
		}
	}

	@Get('templates/:id/preview')
	async getTemplatePreview(@Param('id') id: string, @Res() res: Response) {
		const templateId = parseInt(id, 10);

		if (isNaN(templateId)) {
			return res.status(400).json({ error: 'Invalid template ID' });
		}

		const templateInfo = await this.uploadZipService.getTemplatePreview(templateId);

		if (!templateInfo) {
			return res.status(404).json({ error: 'Template not found' });
		}

		return res.json(templateInfo);
	}

	@Get('templates')
	async getTemplates(): Promise<any> {
		try {
			return await this.uploadZipService.getTemplateInfo();
		} catch (error) {
			throw new HttpException(
				`Failed to get templates: ${error.message}`,
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}
	}
	@Get('availableChains')
	async GetAvailableNftChains() {
		try {
			return await this.uploadZipService.getAvailableNftChains();
		} catch (err) {
			return { "error": `${err}` };
		}
	}
	
	@Get('templateCost')
	async templateCost(@Query('templateId') templateIdString: string) {
		try {
			const templateId = Number(templateIdString);

			if (isNaN(templateId)) {
				return { "error": "templateId must be a number" };
			}
			const templateExists = await this.uploadZipService.checkTemplateExists(templateId);
			if (!templateExists) {
				return { "error": "Template not found" };
			}

			console.log("Before CoinMarketCap update");

			// Force update and wait for it to complete
			await this.coinmarketcapService.getLatestPrice(true);

			console.log("After CoinMarketCap update");

			// Get direct values from queue service for comparison
			const queueMainnet = this.queueService.getTemplateCostsIncludingPrevious('L', 'arbitrum', templateId.toString());
			const queueTestnet = this.queueService.getTemplateCostsIncludingPrevious('T', 'arbitrum', templateId.toString());

			console.log("Direct from queue service:", {
				mainnet: queueMainnet[0],
				testnet: queueTestnet[0]
			});

			// Get values via normal service call
			const result = await this.uploadZipService.templateCost(templateId);

			console.log("Service result:", result);

			// Explicitly construct and return values from queue service
			return {
				'L': {
					'arbitrum': queueMainnet[0]
				},
				'T': {
					'arbitrum': queueTestnet[0]
				}
			};
		} catch (err) {
			console.error("Template cost error:", err);
			return { "error": `${err}` };
		}
	}

	// @Get('claim/')
	// @Header('Content-type', 'application/zip')
	// async claim(
	//   @Query('requestId') requestId: string,
	//   @Signer() signer?: Account,
	// ): Promise<StreamableFile> {
	//   return await this.uploadZipService.claim(requestId, signer);
	// }

	@Get('ServerLtoWalletAddresses')
	getServerLtoWalletAddresses() {
		try {
			const [serverWalletAddressLTO_L, serverWalletAddressLTO_T] = this.uploadZipService.getServerLtoWalletAddresses();
			return {
				"serverLtoWalletAddress_L": serverWalletAddressLTO_L,
				"serverLtoWalletAddress_T": serverWalletAddressLTO_T
			}
		} catch (err) {
			return { "error": `${err}` };
		}
	}

	@Get('GetServerInfo')
	async GetServerInfo() {
		try {
			const balanceARB_L = await this.uploadZipService.GetServerETHBalance('L', 'arbitrum');
			const balanceARB_T = await this.uploadZipService.GetServerETHBalance('T', 'arbitrum');
			const balanceLTO_L = await this.uploadZipService.getLTOAccountBalance('L');
			const balanceLTO_T = await this.uploadZipService.getLTOAccountBalance('T');
			console.log("balanceARB_T", balanceARB_T);
			console.log("balanceARB_L", balanceARB_L);
			console.log("balanceLTO_L", balanceLTO_L);
			console.log("balanceLTO_T", balanceLTO_T);
			const [serverWalletAddressLTO_L, serverWalletAddressLTO_T] = this.uploadZipService.getServerLtoWalletAddresses();
			console.log("serverWalletAddressLTO_L", serverWalletAddressLTO_L);
			console.log("serverWalletAddressLTO_T", serverWalletAddressLTO_T);
			const [serverWalletAddressEVM_L, serverWalletAddressEVM_T] = this.uploadZipService.getServerEVMwalletAddresses('arbitrum');
			console.log("serverWalletAddressEVM_L", serverWalletAddressEVM_L);
			console.log("serverWalletAddressEVM_T", serverWalletAddressEVM_T);
			return {
				"ServerBalanceARB_L": balanceARB_L,
				"ServerBalanceARB_T": balanceARB_T,
				"ServerBalanceLTO_L": balanceLTO_L,
				"ServerBalanceLTO_T": balanceLTO_T,
				"serverLtoWalletAddress_L": serverWalletAddressLTO_L,
				"serverLtoWalletAddress_T": serverWalletAddressLTO_T,
				"serverEvmWalletAddress_L": serverWalletAddressEVM_L,
				"serverEvmWalletAddress_T": serverWalletAddressEVM_T
			};
		} catch (err) {
			return { "error": `${err}` };
		}
	}

}
