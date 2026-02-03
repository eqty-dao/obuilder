import { describe, it, expect } from 'vitest';
import IERC721LockableAbi from './IERC721Lockable';

describe('IERC721Lockable ABI', () => {
    it('should export an array', () => {
        expect(Array.isArray(IERC721LockableAbi)).toBe(true);
    });

    it('should contain ABI entries', () => {
        expect(IERC721LockableAbi.length).toBeGreaterThan(0);
    });

    it('should have valid ABI structure with type field', () => {
        IERC721LockableAbi.forEach((entry: any) => {
            expect(entry).toHaveProperty('type');
            expect(['event', 'function']).toContain(entry.type);
        });
    });

    it('should include key ERC721 functions', () => {
        const functionNames = IERC721LockableAbi
            .filter((e: any) => e.type === 'function')
            .map((e: any) => e.name);

        expect(functionNames).toContain('approve');
        expect(functionNames).toContain('balanceOf');
        expect(functionNames).toContain('ownerOf');
        expect(functionNames).toContain('transferFrom');
        expect(functionNames).toContain('safeTransferFrom');
    });

    it('should include lockable-specific functions', () => {
        const functionNames = IERC721LockableAbi
            .filter((e: any) => e.type === 'function')
            .map((e: any) => e.name);

        expect(functionNames).toContain('lock');
        expect(functionNames).toContain('unlock');
        expect(functionNames).toContain('isLocked');
        expect(functionNames).toContain('unlockChallenge');
    });

    it('should include key events', () => {
        const eventNames = IERC721LockableAbi
            .filter((e: any) => e.type === 'event')
            .map((e: any) => e.name);

        expect(eventNames).toContain('Transfer');
        expect(eventNames).toContain('Approval');
        expect(eventNames).toContain('Lock');
        expect(eventNames).toContain('Unlock');
        expect(eventNames).toContain('Mint');
    });

    it('should have correctly typed function inputs', () => {
        const balanceOf = IERC721LockableAbi.find(
            (e: any) => e.type === 'function' && e.name === 'balanceOf'
        );

        expect(balanceOf).toBeDefined();
        expect(balanceOf!.inputs).toHaveLength(1);
        expect(balanceOf!.inputs[0].type).toBe('address');
        expect(balanceOf!.outputs![0].type).toBe('uint256');
    });

    it('should have correctly typed event inputs', () => {
        const transferEvent = IERC721LockableAbi.find(
            (e: any) => e.type === 'event' && e.name === 'Transfer'
        );

        expect(transferEvent).toBeDefined();
        expect(transferEvent!.inputs).toHaveLength(3);
        expect(transferEvent!.inputs[0].type).toBe('address');
        expect(transferEvent!.inputs[2].type).toBe('uint256');
    });

    it('should include authority management functions', () => {
        const functionNames = IERC721LockableAbi
            .filter((e: any) => e.type === 'function')
            .map((e: any) => e.name);

        expect(functionNames).toContain('isAuthority');
        expect(functionNames).toContain('getAuthorities');
        expect(functionNames).toContain('getAuthorityBaseURI');
    });
});
