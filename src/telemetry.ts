/**
 * OpenTelemetry Instrumentation Setup
 * 
 * This file must be imported BEFORE any other imports in main.ts.
 * It sets up automatic instrumentation for HTTP, Express, NestJS, and more.
 * 
 * Environment Variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint URL (optional, defaults to console)
 * - OTEL_SERVICE_NAME: Service name for traces (defaults to 'obuilder')
 */

// Use require to avoid TypeScript issues with OTEL module types
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');

const serviceName = process.env.OTEL_SERVICE_NAME || 'obuilder';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// Configure exporter based on environment
const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
    : undefined;

// Create OpenTelemetry SDK
const sdk = new NodeSDK({
    resource: new Resource({
        'service.name': serviceName,
        'service.version': process.env.npm_package_version || '1.0.0',
    }),
    traceExporter,
    instrumentations: [
        getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-http': {
                ignoreIncomingRequestHook: (req: any) => {
                    return req.url === '/health' || req.url === '/';
                },
            },
        }),
    ],
});

// Start the SDK
sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('OpenTelemetry SDK shut down successfully'))
        .catch((err: any) => console.error('Error shutting down OpenTelemetry SDK', err))
        .finally(() => process.exit(0));
});

export { sdk };
