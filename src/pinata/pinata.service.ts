import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { LoggingService } from '../logging/redis-logging.service';
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
    let blobPicture: any;
    const pinataMetadata = JSON.stringify({
      name: 'PictureNFT',
    });
    const pinataOptions = JSON.stringify({
      cidVersion: 1,
    });
    const JWT = this.config.get('pinata.jwt');

    // Validate picture buffer
    if (!picture || picture.length === 0) {
      const errorMsg = 'Picture buffer is empty or invalid';
      if (requestId) {
        this.loggingService.logError(requestId, errorMsg);
      }
      throw new Error(errorMsg);
    }

    if (requestId) {
      this.loggingService.log(
        requestId,
        `Picture buffer size: ${picture.length} bytes`,
      );
    }

    blobPicture = new (globalThis.Blob || Blob)([
      new Uint8Array(picture),
    ]) as any;
    const formDataPicture = new (globalThis.FormData || FormData)() as any;

    let imageType = 'image/webp';
    if (
      picture[0] === 0x89 &&
      picture[1] === 0x50 &&
      picture[2] === 0x4e &&
      picture[3] === 0x47
    ) {
      imageType = 'image/png';
    } else if (
      picture[0] === 0xff &&
      picture[1] === 0xd8 &&
      picture[2] === 0xff
    ) {
      imageType = 'image/jpeg';
    } else if (
      picture[0] === 0x47 &&
      picture[1] === 0x49 &&
      picture[2] === 0x46
    ) {
      imageType = 'image/gif';
    }

    if (this.nodeVersion.startsWith('v18.')) {
      formDataPicture.append('file', blobPicture as any);
    } else if (this.nodeVersion.startsWith('v20.')) {
      const fileBlob = new File([blobPicture as any], 'OwnableNftPicture', {
        type: imageType,
      });
      formDataPicture.append('file', fileBlob);
    } else {
      // Fallback for other Node versions
      const fileBlob = new File([blobPicture as any], 'OwnableNftPicture', {
        type: imageType,
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
      // Check if JWT is configured
      if (!JWT || JWT.trim() === '') {
        const errorMsg = 'Pinata JWT token is not configured';
        if (requestId) {
          this.loggingService.logError(requestId, errorMsg);
        }
        throw new Error(errorMsg);
      }

      if (requestId) {
        this.loggingService.log(
          requestId,
          `Making fetch request to Pinata API (JWT configured: ${JWT ? 'yes' : 'no'})`,
        );
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      try {
        requestPicture = await fetch(
          'https://api.pinata.cloud/pinning/pinFileToIPFS',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${JWT}`,
            },
            body: formDataPicture,
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorDetails = {
        message: errorMessage,
        code: (err as any)?.code,
        cause: (err as any)?.cause,
      };

      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to upload image to Pinata: ${JSON.stringify(errorDetails)}`,
        );
      } else {
        console.error('Failed to upload image to Pinata:', errorDetails);
      }
      throw err;
    }

    // Check if the response is OK
    if (!requestPicture.ok) {
      const errorText = await requestPicture.text();
      const errorMsg = `Pinata API returned error status ${requestPicture.status}: ${errorText}`;
      if (requestId) {
        this.loggingService.logError(requestId, errorMsg);
      }
      throw new Error(errorMsg);
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
    let blobJson: any;
    const jsonMetadata = {
      name: name,
      description: description,
      image: `${pinata_gateway_url}/ipfs/${responsePicture.IpfsHash}`,
      attributes: [],
    };

    var buf = Buffer.from(JSON.stringify(jsonMetadata));

    blobJson = new (globalThis.Blob || Blob)([buf]) as any;
    const formDataJson = new (globalThis.FormData || FormData)() as any;

    if (this.nodeVersion.startsWith('v18.')) {
      formDataJson.append('file', blobJson as any);
    } else if (this.nodeVersion.startsWith('v20.')) {
      const fileBlob = new File([blobJson as any], 'OwnableNftJson', {
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
      // Convert Buffer to Uint8Array for compatibility
      const blob = new (globalThis.Blob || Blob)([
        new Uint8Array(content),
      ]) as any;
      const formData = new (globalThis.FormData || FormData)() as any;

      if (this.nodeVersion.startsWith('v18.')) {
        formData.append('file', blob as any);
      } else if (this.nodeVersion.startsWith('v20.')) {
        const fileBlob = new File([blob as any], filename);
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
