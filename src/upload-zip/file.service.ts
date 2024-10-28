import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

@Injectable()
export class FileService {
  async unzip(data: Uint8Array): Promise<Map<string, Buffer>> {
    const zip = new JSZip();
    const archive = await zip.loadAsync(data);
    const files = new Map<string, Buffer>();

    for (const [filename, file] of Object.entries(archive.files)) {
      files.set(filename, await file.async('nodebuffer'));
    }
    return files;
  }

  async readOwnableDataFromZip(files: Map<string, Buffer>) {
    const file = files.get('ownableData.json');
    if (!file) throw new Error('ownableData.json not found in zip');
    return JSON.parse(file.toString());
  }

  async createFile(filePath: string, content: string) {
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, content);
  }
}
