export interface IPFS {
	// Add required IPFS methods here
	add: (data: Buffer) => Promise<any>;
	addAll: (source: Iterable<{ path: string; content: Buffer | Uint8Array }>, options?: { onlyHash?: boolean; cidVersion?: number; recursive?: boolean }) => AsyncIterable<any>;
	stop: () => Promise<void>;
	// Add other methods you use
  }