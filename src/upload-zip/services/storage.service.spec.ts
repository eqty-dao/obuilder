import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OwnableStorageService } from './storage.service';
import JSZip from 'jszip';

describe('OwnableStorageService', () => {
    let service: OwnableStorageService;

    beforeEach(() => {
        service = new OwnableStorageService();
    });

    describe('unzip', () => {
        it('should unzip Uint8Array data', async () => {
            // Create a test zip
            const zip = new JSZip();
            zip.file('test.txt', 'hello world');
            zip.file('data.json', '{"key": "value"}');
            const zipData = await zip.generateAsync({ type: 'uint8array' });

            const result = await service.unzip(zipData);

            expect(result.size).toBe(2);
            expect(result.has('test.txt')).toBe(true);
            expect(result.has('data.json')).toBe(true);
            expect(result.get('test.txt')?.toString()).toBe('hello world');
        });

        it('should handle empty zip', async () => {
            const zip = new JSZip();
            const zipData = await zip.generateAsync({ type: 'uint8array' });

            const result = await service.unzip(zipData);

            expect(result.size).toBe(0);
        });
    });

    describe('readOwnableDataFromZip', () => {
        it('should read first element from ownableData.json', () => {
            const files = new Map<string, Buffer>();
            files.set('ownableData.json', Buffer.from('[{"name": "Test", "value": 123}]'));

            const result = service.readOwnableDataFromZip(files);

            expect(result).toEqual({ name: 'Test', value: 123 });
        });

        it('should throw when ownableData.json is missing', () => {
            const files = new Map<string, Buffer>();
            files.set('other.json', Buffer.from('{}'));

            expect(() => service.readOwnableDataFromZip(files)).toThrow('Failed to read JSON file ownableData.json');
        });

        it('should throw on invalid JSON', () => {
            const files = new Map<string, Buffer>();
            files.set('ownableData.json', Buffer.from('not valid json'));

            expect(() => service.readOwnableDataFromZip(files)).toThrow();
        });
    });

    describe('getFileFromZip', () => {
        it('should return file buffer if exists', () => {
            const files = new Map<string, Buffer>();
            const content = Buffer.from('test content');
            files.set('test.txt', content);

            const result = service.getFileFromZip(files, 'test.txt');

            expect(result).toBe(content);
        });

        it('should return undefined if file does not exist', () => {
            const files = new Map<string, Buffer>();

            const result = service.getFileFromZip(files, 'nonexistent.txt');

            expect(result).toBeUndefined();
        });
    });

    describe('hasFileInZip', () => {
        it('should return true if file exists', () => {
            const files = new Map<string, Buffer>();
            files.set('exists.txt', Buffer.from(''));

            expect(service.hasFileInZip(files, 'exists.txt')).toBe(true);
        });

        it('should return false if file does not exist', () => {
            const files = new Map<string, Buffer>();

            expect(service.hasFileInZip(files, 'nonexistent.txt')).toBe(false);
        });
    });

    describe('getFilenames', () => {
        it('should return all filenames', () => {
            const files = new Map<string, Buffer>();
            files.set('file1.txt', Buffer.from(''));
            files.set('file2.json', Buffer.from(''));
            files.set('folder/file3.txt', Buffer.from(''));

            const result = service.getFilenames(files);

            expect(result).toHaveLength(3);
            expect(result).toContain('file1.txt');
            expect(result).toContain('file2.json');
            expect(result).toContain('folder/file3.txt');
        });
    });

    describe('getTotalSize', () => {
        it('should calculate total size of all files', () => {
            const files = new Map<string, Buffer>();
            files.set('file1.txt', Buffer.from('hello')); // 5 bytes
            files.set('file2.txt', Buffer.from('world!')); // 6 bytes

            const result = service.getTotalSize(files);

            expect(result).toBe(11);
        });

        it('should return 0 for empty map', () => {
            const files = new Map<string, Buffer>();

            expect(service.getTotalSize(files)).toBe(0);
        });
    });
});
