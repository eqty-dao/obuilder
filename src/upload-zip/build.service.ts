import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, cpSync } from 'fs';
import path from 'path';

@Injectable()
export class BuildService {
  async createOwnable(
    buildPath: string,
    metadata: any,
    transactionIdData: any,
  ) {
    const templatePath = path.join(buildPath, 'template');
    this.copyTemplate(templatePath, metadata);
    await this.replacePlaceholders(templatePath, metadata);
    await this.buildOwnable(metadata.PLACEHOLDER1_NAME);
  }

  async completeOwnableCreation(
    requestId: string,
    metadata: any,
    nftInfo: any,
    sender: string,
  ) {
    const finalPath = path.join(__dirname, '..', '..', 'ownables', requestId);
    mkdirSync(finalPath, { recursive: true });

    // Copy build artifacts to the final path
    const buildOutputPath = path.join(
      __dirname,
      '..',
      '..',
      'dist',
      metadata.PLACEHOLDER1_NAME,
    );
    cpSync(buildOutputPath, finalPath, { recursive: true });

    // Write additional metadata or finalize files
    const metadataPath = path.join(finalPath, 'metadata.json');
    const finalMetadata = {
      ...metadata,
      nftInfo,
      createdBy: sender,
      requestId,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(metadataPath, JSON.stringify(finalMetadata, null, 2));

    // Optionally, run a final packaging step
    await this.packageOwnable(finalPath);
  }

  private async copyTemplate(destination: string, metadata: any) {
    const templateSource = path.join(
      __dirname,
      '..',
      '..',
      'templates',
      'template1',
    );
    exec(`cp -R ${templateSource} ${destination}`);
  }

  private async replacePlaceholders(directory: string, metadata: any) {
    const placeholders = [
      { key: 'PLACEHOLDER1_NAME', value: metadata.PLACEHOLDER1_NAME },
      {
        key: 'PLACEHOLDER1_DESCRIPTION',
        value: metadata.PLACEHOLDER1_DESCRIPTION,
      },
      // Add more
    ];

    placeholders.forEach(({ key, value }) => {
      const filePath = path.join(directory, `Cargo.toml`);
      const content = readFileSync(filePath, 'utf8').replace(
        new RegExp(key, 'g'),
        value,
      );
      writeFileSync(filePath, content);
    });
  }

  private async buildOwnable(name: string) {
    return new Promise((resolve, reject) => {
      exec(`npm run build -- ${name}`, (error, stdout, stderr) => {
        if (error) reject(stderr);
        resolve(stdout);
      });
    });
  }

  private async packageOwnable(finalPath: string) {
    return new Promise((resolve, reject) => {
      exec(`zip -r ${finalPath}.zip ${finalPath}`, (error, stdout, stderr) => {
        if (error) reject(stderr);
        resolve(stdout);
      });
    });
  }
}
