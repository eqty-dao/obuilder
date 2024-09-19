
export interface OwnableInfo {
  owner: string;
  issuer: string;
  nft: NftInfo;
}
export interface NftInfo {
  network: string,    
  address: string,  
  id: number  
}
