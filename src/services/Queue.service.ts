import { Injectable } from '@nestjs/common';

@Injectable()
export class QueueService {
  private queueData: Uint8Array[] = [];
  private queueRequestId: String[] = [];
  private isCreating: boolean = false;
  private isQueueing: boolean = true;

  // Enqueue a new Uint8Array to the queue
  enqueue(requestId: String, data: Uint8Array) {
    if ((requestId instanceof String) && (data instanceof Uint8Array)) {
      this.queueData.push(data);
      this.queueRequestId.push(requestId);
    } else {
      throw new Error('Data must be of type Uint8Array');
    }
  }

  // Dequeue and process the Uint8Array data
  dequeue(): [String, Uint8Array] | [null, null] {
    if (this.queueData.length > 0) {
      const data = this.queueData.shift(); // Remove the first item
      const requestId = this.queueRequestId.shift(); // Remove the first item
      // this.processData(data);
      return [requestId, data];
    } else {
      console.log('Queue is empty');
      return null;
    }
  }

  getRequestIdList(): String[] {
    return this.queueRequestId;
  }

  isQueueEmpty(): Boolean {
    return this.queueData.length === 0;    
  }
  creatingOwnable(status: boolean): void {
    this.isCreating = status;
  }
  allowQueueing(status: boolean): void {
    this.isQueueing = status;
  }
  isCreatingOwnable(): boolean {
    return this.isCreating;
  }
  isQueueingAllowed(): boolean {
    return this.isQueueing;
  }
  // Process Uint8Array data (example)
  // private processData(data: Uint8Array) {
  //   console.log('Processing Uint8Array data:', data);

  //   // Example: Convert Uint8Array to string (if it's text data)
  //   const text = new TextDecoder().decode(data);
  //   console.log('Decoded text:', text);
  // }
}