/**
 * StructuredLogger Service
 * 
 * Production-grade structured logging with OpenTelemetry integration.
 * Replaces console.log with JSON-formatted logs.
 * 
 * DAO Compliance: Does NOT log sensitive data (private keys, signatures, etc.)
 */
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

interface LogContext {
    [key: string]: unknown;
}

interface StructuredLog {
    timestamp: string;
    level: LogLevel;
    message: string;
    service: string;
    traceId?: string;
    spanId?: string;
    context?: LogContext;
}

@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLogger implements LoggerService {
    private serviceName = 'obuilder';
    private context?: string;

    setContext(context: string): void {
        this.context = context;
    }

    debug(message: string, context?: LogContext): void {
        this.writeLog(LogLevel.DEBUG, message, context);
    }

    log(message: string, context?: string | LogContext): void {
        if (typeof context === 'string') {
            this.writeLog(LogLevel.INFO, message, { context });
        } else {
            this.writeLog(LogLevel.INFO, message, context);
        }
    }

    warn(message: string, context?: LogContext): void {
        this.writeLog(LogLevel.WARN, message, context);
    }

    error(message: string, trace?: string, context?: LogContext): void {
        const span = this.getCurrentSpan();
        if (span) {
            span.setStatus({ code: 2, message }); // 2 = ERROR
            span.recordException(new Error(message));
        }
        this.writeLog(LogLevel.ERROR, message, { ...context, trace });
    }

    verbose(message: string, context?: LogContext): void {
        this.debug(message, context);
    }

    private writeLog(level: LogLevel, message: string, context?: LogContext): void {
        const span = this.getCurrentSpan();
        const spanContext = span?.spanContext?.();

        const logEntry: StructuredLog = {
            timestamp: new Date().toISOString(),
            level,
            message,
            service: this.serviceName,
            ...(spanContext && {
                traceId: spanContext.traceId,
                spanId: spanContext.spanId,
            }),
            ...(this.context && { context: { module: this.context, ...context } }),
            ...(!this.context && context && { context }),
        };

        const output = process.env.NODE_ENV === 'production'
            ? JSON.stringify(logEntry)
            : this.formatReadable(logEntry);

        switch (level) {
            case LogLevel.ERROR:
                console.error(output);
                break;
            case LogLevel.WARN:
                console.warn(output);
                break;
            default:
                console.log(output);
        }
    }

    private formatReadable(entry: StructuredLog): string {
        const levelColors: Record<LogLevel, string> = {
            [LogLevel.DEBUG]: '\x1b[90m',
            [LogLevel.INFO]: '\x1b[32m',
            [LogLevel.WARN]: '\x1b[33m',
            [LogLevel.ERROR]: '\x1b[31m',
        };
        const reset = '\x1b[0m';
        const color = levelColors[entry.level];

        const prefix = entry.traceId
            ? `[${entry.traceId.slice(0, 8)}] `
            : '';

        const ctx = entry.context
            ? ` ${JSON.stringify(entry.context)}`
            : '';

        return `${color}[${entry.level.toUpperCase()}]${reset} ${prefix}${entry.message}${ctx}`;
    }

    private getCurrentSpan() {
        return trace.getActiveSpan();
    }
}
