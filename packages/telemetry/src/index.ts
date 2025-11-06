import { diag, DiagConsoleLogger, DiagLogLevel, trace, context, SpanStatusCode } from "@opentelemetry/api";
import { BatchSpanProcessor, ConsoleSpanExporter, TracerProvider } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const registry = new Map<string, TracerProvider>();

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

export function ensureTracer(serviceName: string) {
  if (!registry.has(serviceName)) {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      environment: process.env.NODE_ENV ?? "development"
    });

    const provider = new TracerProvider({ resource });
    provider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()));
    provider.register();
    registry.set(serviceName, provider);
  }

  return trace.getTracer(serviceName);
}

export function withSpan<T>(tracerName: string, name: string, fn: () => Promise<T> | T) {
  const tracer = ensureTracer(tracerName);
  const span = tracer.startSpan(name);
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message ?? "error" });
      throw error;
    } finally {
      span.end();
    }
  });
}
