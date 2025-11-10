import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  rmSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  rmdirSync,
  readdirSync,
  statSync,
  createReadStream,
  createWriteStream,
  promises,
} from 'fs';
// import * as fs from 'fs';
import JSZip from 'jszip';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { LoggingService } from '../logging/redis-logging.service';

// Promisify exec for async/await usage
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

@Injectable()
export class FileManagementService {
  constructor(private readonly loggingService: LoggingService) {}

  public async getUniqueId(files: Map<string, Buffer>): Promise<string> {
    return await this.calculateCid(files);
  }

  public async calculateCid(files: Map<string, Buffer>): Promise<string> {
    const { importer } = await import('ipfs-unixfs-importer');
    const { BlackHoleBlockstore } = await import('blockstore-core');

    // Match SDK behavior: include all files except those starting with '.', 'chain.json', and 'timestamp.txt'
    // The SDK's extractAssets filters '.' files, then calculateCid includes all remaining files
    // chain.json is extracted separately from message data, not from zip, so it should NOT be in CID
    const filteredFiles = Array.from(files.entries()).filter(
      ([filename]) =>
        !filename.startsWith('.') &&
        filename !== 'chain.json' && // Exclude chain.json as it's separate from package CID (matches SDK behavior)
        filename !== 'timestamp.txt', // Exclude timestamp.txt as it's obuilder-specific and changes each time
    );

    const source = filteredFiles.map(([filename, buffer]) => ({
      path: `./package/${filename}`,
      content: new Uint8Array(buffer),
    }));

    const blockstore = new BlackHoleBlockstore();

    for await (const entry of importer(source, blockstore)) {
      if (entry.path === 'package' && entry.unixfs?.type === 'directory') {
        return entry.cid.toString();
      }
    }

    throw new Error(
      'Failed to calculate directory CID: importer did not find a directory entry in the input files',
    );
  }

  public async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await promises.stat(path);
      return stats.isDirectory();
    } catch (err) {
      return false;
    }
  }

  public async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
    let archive: JSZip;
    var zip = new JSZip();
    if (typeof data === 'string') {
      archive = await zip.loadAsync(readFileSync(data), {
        createFolders: true,
      });
    } else {
      archive = await zip.loadAsync(data, { createFolders: true });
    }

    const entries: Array<[string, Buffer]> = await Promise.all(
      Object.entries(archive.files)
        // .filter(([filename]) => filename !== 'chain.json')
        .map(async ([filename, file]) => [
          filename,
          await file.async('nodebuffer'),
        ]),
    );

    return new Map(entries);
  }
  public async zipMap(files: Map<string, Buffer>): Promise<Uint8Array> {
    const zip = new JSZip();

    // Add each file to the zip
    for (const [filename, content] of files.entries()) {
      zip.file(filename, content);
    }

    // Generate zip as Uint8Array
    return await zip.generateAsync({ type: 'uint8array' });
  }
  public async storeZip(
    destPath: string,
    uniqueId: string,
    data: Uint8Array,
  ): Promise<void> {
    const file = path.join(destPath, `${uniqueId}.zip`);
    writeFileSync(file, data);
  }

  public async storeFiles(
    destPath: string,
    cid: string,
    files: Map<string, Buffer>,
  ): Promise<void> {
    const packageDir = path.join(destPath, cid);
    mkdirSync(packageDir, { recursive: true });

    await Promise.all(
      Array.from(files.entries()).map(([filename, content]) =>
        writeFileSync(path.join(packageDir, filename), content),
      ),
    );
  }

  public async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  public async createTempDirectory(): Promise<string> {
    const tempDir = path.join(
      os.tmpdir(),
      `file-mgmt-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    );
    this.ensureDirectoryExists(tempDir);
    return tempDir;
  }

  public async cleanupDirectory(dirPath: string): Promise<void> {
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
    }
  }

  public async readFile(filePath: string): Promise<Buffer> {
    return readFileSync(filePath);
  }

  public async readTextFile(filePath: string): Promise<string> {
    return readFileSync(filePath, 'utf8');
  }

  public async copyFile(
    source: string,
    destination: string,
    requestId?: string,
  ): Promise<void> {
    try {
      this.ensureDirectoryExists(path.dirname(destination));
      cpSync(source, destination);
      if (requestId) {
        this.loggingService.log(
          requestId,
          `Successfully copied ${source} to ${destination}`,
        );
      }
    } catch (error) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to copy ${source} to ${destination}: ${error.message}`,
        );
      }
      throw error;
    }
  }
  /**
   * Copies a directory recursively
   * @param sourceDir Source directory path
   * @param destinationDir Destination directory path
   * @param requestId Optional request ID for logging
   */
  public async copyDirectory(
    sourceDir: string,
    destinationDir: string,
    requestId?: string,
  ): Promise<void> {
    try {
      this.ensureDirectoryExists(destinationDir);

      // Use cpSync with recursive option to copy entire directory
      cpSync(sourceDir, destinationDir, { recursive: true });

      if (requestId) {
        this.loggingService.log(
          requestId,
          `Successfully copied directory ${sourceDir} to ${destinationDir}`,
        );
      }
    } catch (error) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to copy directory ${sourceDir} to ${destinationDir}: ${error.message}`,
        );
      }
      throw error;
    }
  }
  public async writeFile(
    filePath: string,
    data: Buffer | string,
    requestId?: string,
  ): Promise<void> {
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      writeFileSync(filePath, data);
      if (requestId) {
        this.loggingService.log(requestId, `Successfully wrote to ${filePath}`);
      }
    } catch (error) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to write to ${filePath}: ${error.message}`,
        );
      }
      throw error;
    }
  }

  public async fileExists(filePath: string): Promise<boolean> {
    return existsSync(filePath);
  }

  public async deleteFile(filePath: string): Promise<void> {
    if (this.fileExists(filePath)) {
      unlinkSync(filePath);
    }
  }

  public async getFileStats(filePath: string): Promise<any> {
    return statSync(filePath);
  }

  public async listFiles(
    dirPath: string,
    recursive = false,
  ): Promise<string[]> {
    if (!existsSync(dirPath)) {
      return [];
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });
    let files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        files = files.concat(await this.listFiles(fullPath, recursive));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  // Stream operations
  public createReadStream(filePath: string): any {
    return createReadStream(filePath);
  }

  public createWriteStream(filePath: string): any {
    this.ensureDirectoryExists(path.dirname(filePath));
    return createWriteStream(filePath);
  }

  // Helper method for calculating file hash
  public async calculateFileHash(filePath: string): Promise<string> {
    const content = await this.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  public async executeCommandWithLogging(
    command: string,
    requestId: string,
    options: any = {},
  ): Promise<string> {
    try {
      this.loggingService.log(requestId, `Executing command: ${command}`);
      const { stdout, stderr } = await this.executeCommand(command, options);
      const output = stdout || stderr;
      const outputStr = Buffer.isBuffer(output) ? output.toString() : output;
      this.loggingService.log(requestId, `Command output: ${outputStr}`);
      return outputStr;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Command failed: ${command} - ${error.message}`,
      );
      throw error;
    }
  }

  // For network-specific commands
  public async executeCommandWithNetworkLogging(
    ltoNetworkId: 'L' | 'T',
    command: string,
    requestId: string,
    options: any = {},
    queueService?: any,
  ): Promise<string> {
    try {
      this.loggingService.log(
        requestId,
        `Executing command on LTO network ${ltoNetworkId}: ${command}`,
      );
      const { stdout, stderr } = await this.executeCommand(command, options);
      const output = stdout || stderr;
      const outputStr = Buffer.isBuffer(output) ? output.toString() : output;
      this.loggingService.log(requestId, `Command output: ${outputStr}`);
      return outputStr;
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Error executing command on LTO network ${ltoNetworkId}: ${error.message}`,
      );
      if (queueService) {
        queueService.ownableFailed(
          ltoNetworkId,
          requestId,
          `Error executing command ${error.message}`,
        );
      }
      throw error;
    }
  }

  // Batch replace method for multiple replacements in files
  public async batchReplaceInFile(
    basePath: string,
    replacements: Array<{
      filePath: string;
      searchValue: string | RegExp;
      replacement: string | ((line: string, index: number) => string);
    }>,
    requestId: string,
  ): Promise<void> {
    try {
      this.loggingService.log(
        requestId,
        `Replacing placeholder texts in ${replacements.length} locations`,
      );

      for (const { filePath, searchValue, replacement } of replacements) {
        const fullPath = path.join(basePath, filePath);
        await this.replaceLineInFile(
          fullPath,
          searchValue,
          replacement,
          requestId,
        );
      }

      this.loggingService.log(
        requestId,
        `Successfully replaced all placeholder texts`,
      );
    } catch (error) {
      this.loggingService.logError(
        requestId,
        `Failed to replace placeholder texts: ${error.message}`,
      );
      throw error;
    }
  }
  public async executeCommand(
    command: string,
    options: any = {},
  ): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
    try {
      return await execAsync(command, options);
    } catch (error) {
      // Optionally log the error
      throw new Error(`Command execution failed: ${error.message}`);
    }
  }
  public isValidPackageName(name: string): boolean {
    // Regular expression to match Unicode letters, numbers, underscores, and hyphens
    const xidRegex = /^[a-zA-Z0-9]+(\.webp)?$/g;
    console.log('isValidPackageName', xidRegex.test(name));
    return xidRegex.test(name);
  }
  public sanitizePackageName(name: string, hasdotWebp: boolean): string {
    // Regular expression to match invalid characters
    let baseStr: string = name;
    let extension: string = '';
    if (hasdotWebp && name.endsWith('.webp')) {
      baseStr = name.slice(0, -5); // Remove the .webp part
      extension = '.webp';
    }
    // Replace all non-alphanumeric characters with nothing
    const sanitizedBaseStr = baseStr.replace(/[^a-zA-Z0-9]/g, '');
    return sanitizedBaseStr + extension;
  }

  public getTemplateIdNumber(jsonFile: any, requestId: string): number {
    let templateId: number;
    const input = jsonFile.template;
    if (!input) {
      this.loggingService.logError(
        requestId,
        'Template not specified in ownableData.json',
      );
      throw new Error('Template not specified in ownableData.json');
    }
    const match = input.match(/\d+$/); // Match one or more digits at the end of the string
    templateId = match ? Number(match[0]) : null; // Convert to number if a match is found
    return templateId;
  }
  public async executeFile(
    file: string,
    args: string[] = [],
    options: any = {},
  ): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
    try {
      return await execFileAsync(file, args, options);
    } catch (error) {
      throw new Error(`File execution failed: ${error.message}`);
    }
  }

  public spawnProcess(
    command: string,
    args: string[] = [],
    options: any = {},
  ): any {
    return spawn(command, args, options);
  }
  /**
   * Replaces a specific line in a file that matches a pattern
   * @param filePath Path to the file
   * @param searchValue Pattern to search for (string or RegExp)
   * @param replacement Replacement string or function
   * @param requestId Optional request ID for logging
   * @returns Promise resolving to boolean indicating if replacement occurred
   */
  public async replaceLineInFile(
    filePath: string,
    searchValue: string | RegExp,
    replacement: string | ((line: string, index: number) => string),
    requestId?: string,
  ): Promise<boolean> {
    try {
      // Read the file content
      const content = await this.readTextFile(filePath);

      // Split into lines
      const lines = content.split('\n');

      // Track if we made replacements
      let replaced = false;

      // Process each line
      const newLines = lines.map((line, index) => {
        if (typeof searchValue === 'string') {
          if (line.includes(searchValue)) {
            replaced = true;
            return typeof replacement === 'function'
              ? replacement(line, index)
              : line.replace(searchValue, replacement);
          }
        } else if (searchValue instanceof RegExp) {
          if (searchValue.test(line)) {
            replaced = true;
            return typeof replacement === 'function'
              ? replacement(line, index)
              : line.replace(searchValue, replacement);
          }
        }
        return line;
      });

      // If replacements were made, write the file
      if (replaced) {
        await this.writeFile(filePath, newLines.join('\n'));
        if (requestId) {
          this.loggingService.log(
            requestId,
            `Replaced content in file ${filePath}`,
          );
        }
      } else if (requestId) {
        this.loggingService.log(
          requestId,
          `No matches found for replacement in ${filePath}`,
        );
      }

      return replaced;
    } catch (error) {
      if (requestId) {
        this.loggingService.logError(
          requestId,
          `Failed to replace line in file ${filePath}: ${error.message}`,
        );
      }
      throw new Error(
        `Failed to replace line in file ${filePath}: ${error.message}`,
      );
    }
  }
}
