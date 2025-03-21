export interface IPFS {
	// Add required IPFS methods here
	add: (data: Buffer) => Promise<any>;
	// Add other methods you use
  }