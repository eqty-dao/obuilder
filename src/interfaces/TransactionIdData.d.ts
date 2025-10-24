export interface TransactionIdData {
  type: number;
  sender: string;
  recipient: string;
  amount: number;
  transactionId?: string;
  confirmed?: boolean;
}
