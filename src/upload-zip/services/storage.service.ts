import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import { readFileSync } from 'fs';

/**
 * OwnableStorageService
 *
 * Handles ZIP file operations and data extraction for Ownables.
 * Extracted from UploadZipService for better separation of concerns.
 */
@Injectable()
export class OwnableStorageService {
    private readonly logger = new Logger(OwnableStorageService.name);

    /**
     * Unzip data from Uint8Array or file path
     * @param data Uint8Array of zip data or path to zip file
     * @returns Map of filename to file content
     */
    public async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
        let archive: JSZip;
        const zip = new JSZip();

        if (typeof data === 'string') {
            // Load from file path
            archive = await zip.loadAsync(readFileSync(data), { createFolders: true });
        } else {
            // Load from Uint8Array
            archive = await zip.loadAsync(data, { createFolders: true });
        }

        const entries: Array<[string, Buffer]> = await Promise.all(
            Object.entries(archive.files).map(async ([filename, file]) => [
                filename,
                await file.async('nodebuffer'),
            ]),
        );

        this.logger.debug(`Unzipped ${entries.length} files`);
        return new Map(entries);
    }

    /**
     * Read ownableData.json from unzipped files
     * @param files Map of unzipped files
     * @returns First element of ownableData.json array
     */
    public readOwnableDataFromZip(files: Map<string, Buffer>): any {
        try {
            const ownableDataBuffer = files.get('ownableData.json');
            if (!ownableDataBuffer) {
                throw new Error('ownableData.json not found in zip');
            }
            return JSON.parse(ownableDataBuffer.toString())[0];
        } catch (error) {
            this.logger.error(`Failed to read ownableData.json: ${error}`);
            throw new Error('Failed to read JSON file ownableData.json');
        }
    }

    /**
     * Get file from unzipped map by name
     * @param files Map of unzipped files
     * @param filename Name of file to retrieve
     */
    public getFileFromZip(files: Map<string, Buffer>, filename: string): Buffer | undefined {
        return files.get(filename);
    }

    /**
     * Check if a file exists in the unzipped map
     */
    public hasFileInZip(files: Map<string, Buffer>, filename: string): boolean {
        return files.has(filename);
    }

    /**
     * Get list of all filenames in the zip
     */
    public getFilenames(files: Map<string, Buffer>): string[] {
        return Array.from(files.keys());
    }

    /**
     * Get total size of all files in bytes
     */
    public getTotalSize(files: Map<string, Buffer>): number {
        let total = 0;
        for (const buffer of files.values()) {
            total += buffer.length;
        }
        return total;
    }
}
