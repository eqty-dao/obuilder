import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);
  private readonly tempDir: string;
  private readonly maxFileSize: number = 100 * 1024 * 1024; // 100MB

  constructor() {
    this.tempDir = join(process.cwd(), 'temp');
    this.initializeTempDir();
  }

  private async initializeTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create temp directory', error);
      throw new Error('Failed to initialize file system');
    }
  }

  public async createTempFile(content: Buffer, extension: string = ''): Promise<string> {
    const tempPath = join(this.tempDir, `${uuidv4()}${extension}`);
    try {
      await fs.writeFile(tempPath, content);
      return tempPath;
    } catch (error) {
      this.logger.error(`Failed to create temp file: ${tempPath}`, error);
      throw new Error('Failed to create temporary file');
    }
  }

  public async copyFile(source: string, destination: string): Promise<void> {
    try {
      await fs.copyFile(source, destination);
    } catch (error) {
      this.logger.error(`Failed to copy file from ${source} to ${destination}`, error);
      throw new Error('Failed to copy file');
    }
  }

  public async readFile(path: string): Promise<Buffer> {
    try {
      const stats = await fs.stat(path);
      if (stats.size > this.maxFileSize) {
        throw new Error('File size exceeds maximum allowed size');
      }
      return await fs.readFile(path);
    } catch (error) {
      this.logger.error(`Failed to read file: ${path}`, error);
      throw new Error('Failed to read file');
    }
  }

  public async writeFile(path: string, content: Buffer): Promise<void> {
    try {
      await fs.writeFile(path, content);
    } catch (error) {
      this.logger.error(`Failed to write file: ${path}`, error);
      throw new Error('Failed to write file');
    }
  }

  public async deleteFile(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${path}`, error);
      throw new Error('Failed to delete file');
    }
  }

  public async cleanupTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        const filePath = join(this.tempDir, file);
        try {
          await fs.unlink(filePath);
        } catch (error) {
          this.logger.warn(`Failed to delete temp file: ${filePath}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup temp files', error);
      throw new Error('Failed to cleanup temporary files');
    }
  }

  public async getDiskSpace(): Promise<{ free: number; total: number }> {
    try {
      const { stdout } = await require('child_process').exec('df -k .');
      const lines = stdout.split('\n');
      const [, free, total] = lines[1].split(/\s+/);
      return {
        free: parseInt(free) * 1024,
        total: parseInt(total) * 1024
      };
    } catch (error) {
      this.logger.error('Failed to get disk space', error);
      throw new Error('Failed to get disk space information');
    }
  }
} 