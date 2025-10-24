import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { LoggingService } from '../logging/redis-logging.service';
import { Blob } from 'buffer';
import { PinataSDK } from 'pinata';

@Injectable()
export class PinataService {
  private nodeVersion = process.version;
  private pinata: PinataSDK;

  constructor(
    private readonly config: ConfigService,
    private readonly loggingService: LoggingService,
  ) {
    this.pinata = new PinataSDK({
      pinataJwt: this.config.get('pinata.jwt'),
      pinataGateway: this.config.get('pinata.gateway'),
    });
  }

  /**
   * Pins a file to IPFS via Pinata and creates metadata
   * @param picture The file buffer to pin
   * @param name Name for the NFT metadata
   * @param description Description for the NFT metadata
   * @returns IPFS URL of the pinned metadata JSON
   */
  public async createPinnedFile(
    picture: Buffer,
    name: string,
    description: string,
    requestId?: string,
  ): Promise<string> {
    let blobPicture: Blob;
    const pinataMetadata = JSON.stringify({
      name: 'PictureNFT',
    });
    const pinataOptions = JSON.stringify({
      cidVersion: 1,
    });
    const JWT = this.config.get('pinata.jwt');

    // First, pin the image
    blobPicture = new Blob([picture]);
    const formDataPicture = new FormData();

    if (this.nodeVersion.startsWith('v18.')) {
      formDataPicture.append('file', blobPicture);
    } else if (this.nodeVersion.startsWith('v20.')) {
      const fileBlob = new File([blobPicture], 'OwnableNftPicture', {
        type: 'image/webp',
      });
      formDataPicture.append('file', fileBlob);
    }

    formDataPicture.append('pinataMetadata', pinataMetadata);
    formDataPicture.append('pinataOptions', pinataOptions);

    if (requestId) {
      this.loggingService.log(requestId, 'Uploading image to Pinata IPFS...');
    }

    let requestPicture: any;
    try {
      requestPicture = await fetch(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${JWT}`,
          },
          body: formDataPicture,
        },
      );
    } catch (err) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to upload image to Pinata: ${err}`,
        );
      }
      throw err;
    }

    let responsePicture: any;
    try {
      responsePicture = await requestPicture.json();
      if (requestId) {
        this.loggingService.log(
          requestId,
          `Image uploaded to Pinata with hash: ${responsePicture.IpfsHash}`,
        );
      }
    } catch (err) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to parse Pinata response: ${err}`,
        );
      }
      throw err;
    }

    const pinata_gateway_url = this.config.get('pinata.gateway');

    // Now create and pin the metadata JSON
    let blobJson: Blob;
    const jsonMetadata = {
      name: name,
      description: description,
      image: `${pinata_gateway_url}/ipfs/${responsePicture.IpfsHash}`,
      attributes: [],
    };

    var buf = Buffer.from(JSON.stringify(jsonMetadata));

    blobJson = new Blob([buf]);
    const formDataJson = new FormData();

    if (this.nodeVersion.startsWith('v18.')) {
      formDataJson.append('file', blobJson);
    } else if (this.nodeVersion.startsWith('v20.')) {
      const fileBlob = new File([blobJson], 'OwnableNftJson', {
        type: 'application/json',
      });
      formDataJson.append('file', fileBlob);
    }

    formDataJson.append('pinataMetadata', pinataMetadata);
    formDataJson.append('pinataOptions', pinataOptions);

    if (requestId) {
      this.loggingService.log(
        requestId,
        'Uploading metadata JSON to Pinata IPFS...',
      );
    }

    let requestJson: any;
    try {
      requestJson = await fetch(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${JWT}`,
          },
          body: formDataJson,
        },
      );
    } catch (err) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to upload metadata JSON to Pinata: ${err}`,
        );
      }
      throw err;
    }

    let responseJson: any;
    try {
      responseJson = await requestJson.json();
      if (requestId) {
        this.loggingService.log(
          requestId,
          `Metadata JSON uploaded to Pinata with hash: ${responseJson.IpfsHash}`,
        );
      }
    } catch (err) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to parse Pinata JSON response: ${err}`,
        );
      }
      throw err;
    }

    return `${pinata_gateway_url}/ipfs/${responseJson.IpfsHash}`;
  }

  /**
   * Pin a generic file to Pinata's IPFS
   * @param content File content to pin
   * @param filename Filename for the upload
   * @param requestId Optional request ID for logging
   * @returns IPFS hash of pinned file
   */
  // Update the pinFile method to use direct fetch API like the original code
  public async pinFile(
    content: Buffer,
    filename: string,
    requestId?: string,
  ): Promise<string> {
    try {
      const JWT = this.config.get('pinata.jwt');
      const pinataMetadata = JSON.stringify({ name: filename });
      const pinataOptions = JSON.stringify({ cidVersion: 1 });

      // Create blob and form data
      const blob = new Blob([content]);
      const formData = new FormData();

      if (this.nodeVersion.startsWith('v18.')) {
        formData.append('file', blob);
      } else if (this.nodeVersion.startsWith('v20.')) {
        const fileBlob = new File([blob], filename);
        formData.append('file', fileBlob);
      }

      formData.append('pinataMetadata', pinataMetadata);
      formData.append('pinataOptions', pinataOptions);

      // Make direct fetch request to Pinata API
      const response = await fetch(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${JWT}`,
          },
          body: formData,
        },
      );

      const result = await response.json();

      if (requestId) {
        this.loggingService.log(
          requestId,
          `File ${filename} pinned with hash: ${result.IpfsHash}`,
        );
      }

      return result.IpfsHash;
    } catch (error) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to pin file: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
