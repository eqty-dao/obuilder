/**
 * Interfaces for eqty-core abstractions
 * These interfaces enable better testability by allowing mock implementations
 */

/**
 * Signer interface compatible with eqty-core ISigner
 */
export interface ISigner {
    getAddress(): Promise<string>;
    signTypedData(
        domain: Record<string, any>,
        types: Record<string, any[]>,
        value: Record<string, any>,
    ): Promise<string>;
}

/**
 * Message interface for peer-to-peer communication
 */
export interface IMessage {
    /** Set the recipient address */
    to(recipient: string): void;
    /** Sign the message with a signer */
    signWith(signer: ISigner): Promise<void>;
    /** Check if the message is signed */
    isSigned(): boolean;
    /** Message hash (available after signing) */
    hash?: {
        base58?: string;
        hex?: string;
    };
    /** Message content */
    content?: any;
}

/**
 * Relay interface for message delivery
 */
export interface IRelay {
    /** Send a signed message via the relay */
    send(message: IMessage): Promise<any>;
}

/**
 * Factory interface for creating eqty-core objects
 * Enables dependency injection and mocking
 */
export interface IEqtyFactory {
    /** Create a new Message instance */
    createMessage(content: string | Uint8Array | object, mediaType?: string): IMessage;
    /** Create a new Relay instance */
    createRelay(url: string): IRelay;
}

/**
 * Default implementation using real eqty-core
 */
export class EqtyCoreFactory implements IEqtyFactory {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    private eqtyCore = require('eqty-core');

    createMessage(content: string | Uint8Array | object, mediaType?: string): IMessage {
        return new this.eqtyCore.Message(content, mediaType);
    }

    createRelay(url: string): IRelay {
        return new this.eqtyCore.Relay(url);
    }
}

/**
 * Provider token for dependency injection
 */
export const EQTY_FACTORY = 'EQTY_FACTORY';
