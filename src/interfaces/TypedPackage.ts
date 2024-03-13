export interface TypedPackageCapabilities {
    isDynamic: boolean;
    hasMetadata: boolean;
    hasWidgetState: boolean;
    isConsumable: boolean;
    isConsumer: boolean;
    isTransferable: boolean;
  }
  
  export interface TypedPackage extends TypedPackageCapabilities {
    title: string;
    name: string;
    description?: string;
    cid: string;
    versions: Array<{date: Date, cid: string}>;
    keywords: string[];
  }
export interface NftInfo {
    network: string,    // eip155:1
    id: number,
    address: string, // 0x341...
    lock_service: string,
  }
  