import { NftInfo } from "./OwnableInfo";

export interface QueueEntry {
    rid: string;
    data: string;
    ltoWallet: string;
    hash: string;
    txId: string;
    ownableStatus: OwnableStatus;
    templateId: number;
    timestampInQueue: number;
    timestampProcessing: number;
    timestampReady: number;
    timestampSent: number;
    cid: string;
    nftInfo: NftInfo;
    // nftNetwork: string;
    // nftAddress: string;
    // nftId: number;
}

export enum OwnableStatus {
    Unknown,      // 0
    InQueue,      // 1
    Processing,   // 2
    Ready,        // 3
    Sent          // 4
}