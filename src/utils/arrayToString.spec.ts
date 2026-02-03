import { describe, it, expect } from 'vitest';
import arrayToString from './arrayToString';

describe('arrayToString', () => {
    it('should convert single element array to quoted string', () => {
        const result = arrayToString(['hello']);
        expect(result).toBe('"hello"');
    });

    it('should convert multiple elements to comma-separated quoted strings', () => {
        const result = arrayToString(['hello', 'world']);
        expect(result).toBe('"hello", "world"');
    });

    it('should handle three or more elements', () => {
        const result = arrayToString(['a', 'b', 'c', 'd']);
        expect(result).toBe('"a", "b", "c", "d"');
    });

    it('should handle empty strings in array', () => {
        const result = arrayToString(['', 'test']);
        expect(result).toBe('"", "test"');
    });

    it('should handle strings with special characters', () => {
        const result = arrayToString(['hello world', 'test@123']);
        expect(result).toBe('"hello world", "test@123"');
    });

    it('should return undefined for empty array', () => {
        const result = arrayToString([]);
        expect(result).toBeUndefined();
    });
});
