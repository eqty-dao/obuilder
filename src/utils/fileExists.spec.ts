import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fileExists from './fileExists';
import fs from 'fs/promises';

// Mock fs/promises module
vi.mock('fs/promises', () => ({
    default: {
        access: vi.fn(),
    },
}));

describe('fileExists', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return true when file exists', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const result = await fileExists('/path/to/existing/file.txt');

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledWith('/path/to/existing/file.txt');
    });

    it('should return false when file does not exist', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await fileExists('/path/to/nonexistent/file.txt');

        expect(result).toBe(false);
        expect(fs.access).toHaveBeenCalledWith('/path/to/nonexistent/file.txt');
    });

    it('should return false when access is denied', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('EACCES'));

        const result = await fileExists('/path/to/protected/file.txt');

        expect(result).toBe(false);
    });

    it('should handle empty path', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await fileExists('');

        expect(result).toBe(false);
        expect(fs.access).toHaveBeenCalledWith('');
    });

    it('should handle relative paths', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const result = await fileExists('./relative/path.txt');

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledWith('./relative/path.txt');
    });

    it('should handle paths with special characters', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const result = await fileExists('/path/with spaces/and-dash.txt');

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledWith('/path/with spaces/and-dash.txt');
    });
});
