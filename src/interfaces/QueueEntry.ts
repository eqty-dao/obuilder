import { NftInfo } from "./OwnableInfo";

export interface QueueEntry {
    requestId: string;
    networkId: 'L'|'T';
    status: OwnableStatus;
    templateId: string;
    sender: string;
    transactionId: string;
    timestamp: Date;
    nftInfo: NftInfo;
    // Legacy fields for compatibility
    rid?: string;
    data?: string;
    ltoWallet?: string;
    ltoNetworkId?: 'L'|'T';
    hash?: string;
    txId?: string;
    ownableStatus?: OwnableStatus;
    timestampInQueue?: number;
    timestampProcessing?: number;
    timestampReady?: number;
    timestampSent?: number;
    timestampFailed?: number;
    failedErrMsg?: string;
    cid?: string;
    reenqueued?: boolean;
    reenqueued_NFTURI?: string;	
    paymentTransactionId?: string;
}

export enum OwnableStatus {
    Unknown,      // 0
    InQueue,      // 1
    Processing,   // 2
    Ready,        // 3
    Sent,         // 4
    Failed,       // 5
    Pending,      // 6 - New status for Redis implementation
}