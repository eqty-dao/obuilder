
export interface OwnableInfo {
  owner: string;
  issuer: string;
  nft: NftInfo;
}
export interface NftInfo {
  network: string,    // eip155:1  
  address: string,  // 0x341...
  id: number  
}
