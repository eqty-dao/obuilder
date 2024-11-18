import { Injectable } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class LoggingService {
  private logs: { rid: string, level: string, message: string, timestamp: Date }[] = [];

  constructor(
    private readonly s3: S3Service
  ) {
  }
  
  log(rid: string, message: string) {
    const logEntry = { rid: rid, level: 'info', message, timestamp: new Date() };
    this.logs.push(logEntry);
    console.log(`Info: ${rid}: ${message}`); // Optional: Print to console as well
  }
  logError(rid: string, message: string) {
    const logEntry = { rid: rid, level: 'error', message, timestamp: new Date() };
    this.logs.push(logEntry);
    console.log(`Error: ${rid}: ${message}`); // Optional: Print to console as well
  }

  getLogs(): { rid: string, level: string, message: string, timestamp: Date }[] {
    return this.logs;
  }
  getLogsByRid(rid: string): { rid: string, level: string, message: string, timestamp: Date }[] {
    return this.logs.filter(log => log.rid === rid);
  }
}
