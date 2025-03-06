import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
	rmSync, cpSync, mkdirSync, readFileSync, writeFileSync,
	existsSync, unlinkSync, rmdirSync, readdirSync, statSync,
	createReadStream, createWriteStream
} from 'fs';
import * as fs from 'fs/promises';
import JSZip from 'jszip';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';

// Promisify exec for async/await usage
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
@Injectable()
export class FileManagementService {
	constructor(
		@Inject('IPFS') private readonly ipfs: IPFS,
	) {

	}
	public async getUniqueId(files: Map<string, Buffer>): Promise<string> {
		const source = Array.from(files.entries()).map(([filename, content]) => ({
			path: `./${filename}`,
			content,
		}));

		for await (const entry of this.ipfs.addAll(source, { onlyHash: true, cidVersion: 1 })) {
			//if (entry.path === entry.cid.toString() && !!entry.mode) return entry.cid.toString();
			if (entry.path === entry.cid.toString()) {
				return entry.cid.toString();
			}
		}
		throw new Error('Failed to calculate directory CID: importer did not find a directory entry in the input files');
	}



	public async unzip(data: Uint8Array | string): Promise<Map<string, Buffer>> {
		let archive: JSZip;
		var zip = new JSZip();
		if (typeof data === "string") {
			archive = await zip.loadAsync(readFileSync(data), { createFolders: true });
		} else {
			archive = await zip.loadAsync(data, { createFolders: true });
		}

		const entries: Array<[string, Buffer]> = await Promise.all(
			Object.entries(archive.files)
				// .filter(([filename]) => filename !== 'chain.json')
				.map(async ([filename, file]) => [filename, await file.async('nodebuffer')]),
		);

		return new Map(entries);
	}

	public async storeZip(destPath: string, uniqueId: string, data: Uint8Array): Promise<void> {
		const file = path.join(destPath, `${uniqueId}.zip`);
		writeFileSync(file, data);
	}

	public async storeFiles(destPath: string, cid: string, files: Map<string, Buffer>): Promise<void> {
		const packageDir = path.join(destPath, cid);
		mkdirSync(packageDir, { recursive: true });

		await Promise.all(
			Array.from(files.entries()).map(([filename, content]) => writeFileSync(path.join(packageDir, filename), content)),
		);
	}

	public async ensureDirectoryExists(dirPath: string): Promise<void> {
		if (!existsSync(dirPath)) {
			mkdirSync(dirPath, { recursive: true });
		}
	}

	public async createTempDirectory(): Promise<string> {
		const tempDir = path.join(os.tmpdir(), `file-mgmt-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`);
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

	public async writeFile(filePath: string, data: Buffer | string): Promise<void> {
		this.ensureDirectoryExists(path.dirname(filePath));
		writeFileSync(filePath, data);
	}

	public async copyFile(sourcePath: string, destPath: string): Promise<void> {
		this.ensureDirectoryExists(path.dirname(destPath));
		cpSync(sourcePath, destPath, { "recursive": true });
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

	public async listFiles(dirPath: string, recursive = false): Promise<string[]> {
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

	public async executeCommand(command: string, options: any = {}): Promise<{ stdout: string | Buffer, stderr: string | Buffer }> {
		try {
			return await execAsync(command, options);
		} catch (error) {
			// Optionally log the error
			throw new Error(`Command execution failed: ${error.message}`);
		}
	}

	public async executeFile(file: string, args: string[] = [], options: any = {}): Promise<{ stdout: string | Buffer, stderr: string | Buffer }> {
		try {
			return await execFileAsync(file, args, options);
		} catch (error) {
			throw new Error(`File execution failed: ${error.message}`);
		}
	}

	public spawnProcess(command: string, args: string[] = [], options: any = {}): any {
		return spawn(command, args, options);
	}
	/**
 * Replaces a specific line in a file that matches a pattern
 * @param filePath Path to the file
 * @param searchValue Pattern to search for (string or RegExp)
 * @param replacement Replacement string or function
 * @returns Promise resolving to boolean indicating if replacement occurred
 */
	public async replaceLineInFile(
		filePath: string,
		searchValue: string | RegExp,
		replacement: string | ((line: string, index: number) => string)
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
			}

			return replaced;
		} catch (error) {
			throw new Error(`Failed to replace line in file ${filePath}: ${error.message}`);
		}
	}
}
