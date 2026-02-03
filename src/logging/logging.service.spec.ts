import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggingService } from './logging.service';
import { S3Service } from '../s3/s3.service';

describe('LoggingService', () => {
  let service: LoggingService;
  let mockS3: Partial<S3Service>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on console.log
    vi.spyOn(console, 'log').mockImplementation(() => { });

    mockS3 = {};

    service = new LoggingService(mockS3 as S3Service);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should start with empty logs', () => {
      const logs = service.getLogs();
      expect(logs).toHaveLength(0);
    });
  });

  describe('log', () => {
    it('should add info log entry', () => {
      service.log('test-rid-1', 'Test message');

      const logs = service.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].rid).toBe('test-rid-1');
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });

    it('should print to console', () => {
      service.log('test-rid', 'Console message');

      expect(console.log).toHaveBeenCalledWith('Info: test-rid: Console message');
    });

    it('should accumulate multiple log entries', () => {
      service.log('rid-1', 'First message');
      service.log('rid-2', 'Second message');
      service.log('rid-3', 'Third message');

      const logs = service.getLogs();
      expect(logs).toHaveLength(3);
    });
  });

  describe('logError', () => {
    it('should add error log entry', () => {
      service.logError('error-rid', 'Error occurred');

      const logs = service.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].rid).toBe('error-rid');
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toBe('Error occurred');
    });

    it('should print error to console', () => {
      service.logError('error-rid', 'Error message');

      expect(console.log).toHaveBeenCalledWith('Error: error-rid: Error message');
    });

    it('should be distinguishable from info logs', () => {
      service.log('test-rid', 'Info message');
      service.logError('test-rid', 'Error message');

      const logs = service.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe('info');
      expect(logs[1].level).toBe('error');
    });
  });

  describe('getLogs', () => {
    it('should return all logs', () => {
      service.log('rid-1', 'Message 1');
      service.logError('rid-2', 'Error 2');
      service.log('rid-3', 'Message 3');

      const logs = service.getLogs();
      expect(logs).toHaveLength(3);
    });

    it('should return logs in order added', () => {
      service.log('first', 'First');
      service.log('second', 'Second');

      const logs = service.getLogs();
      expect(logs[0].rid).toBe('first');
      expect(logs[1].rid).toBe('second');
    });
  });

  describe('getLogsByRid', () => {
    it('should filter logs by request ID', () => {
      service.log('target-rid', 'Target message 1');
      service.log('other-rid', 'Other message');
      service.logError('target-rid', 'Target error');
      service.log('another-rid', 'Another message');

      const filteredLogs = service.getLogsByRid('target-rid');
      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0].message).toBe('Target message 1');
      expect(filteredLogs[1].message).toBe('Target error');
    });

    it('should return empty array for non-existent rid', () => {
      service.log('existing-rid', 'Some message');

      const logs = service.getLogsByRid('non-existent');
      expect(logs).toHaveLength(0);
    });

    it('should handle empty logs', () => {
      const logs = service.getLogsByRid('any-rid');
      expect(logs).toHaveLength(0);
    });

    it('should include both info and error logs for same rid', () => {
      service.log('shared-rid', 'Info log');
      service.logError('shared-rid', 'Error log');

      const logs = service.getLogsByRid('shared-rid');
      expect(logs).toHaveLength(2);
      expect(logs.some(l => l.level === 'info')).toBe(true);
      expect(logs.some(l => l.level === 'error')).toBe(true);
    });
  });
});
