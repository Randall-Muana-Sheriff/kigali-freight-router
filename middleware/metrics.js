import client from 'prom-client';

// A dedicated registry (rather than the global default) keeps this app's
// metrics isolated and testable. collectDefaultMetrics adds standard
// process/runtime metrics (CPU, memory, event loop lag, GC) that are
// expected by any Prometheus-based monitoring setup.
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
    name: 'kigali_http_requests_total',
    help: 'Total number of HTTP requests.',
    registers: [register],
});

const httpRequestDurationMs = new client.Histogram({
    name: 'kigali_http_request_duration_ms',
    help: 'HTTP request duration in milliseconds.',
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [register],
});

const httpRequestsByRoute = new client.Counter({
    name: 'kigali_http_requests_route_total',
    help: 'Total number of HTTP requests by method, path, and status.',
    labelNames: ['method', 'path', 'status'],
    registers: [register],
});

const socketEventsTotal = new client.Counter({
    name: 'kigali_socket_events_total',
    help: 'Total number of socket events observed.',
    registers: [register],
});

const socketEventsByName = new client.Counter({
    name: 'kigali_socket_events_by_name_total',
    help: 'Total number of socket events grouped by event name.',
    labelNames: ['event'],
    registers: [register],
});

export function observeHttpRequest({ method, routePath, statusCode, durationMs }) {
    httpRequestsTotal.inc();
    httpRequestDurationMs.observe(durationMs);
    httpRequestsByRoute.inc({ method, path: routePath, status: String(statusCode) });
}

export function observeSocketEvent(eventName) {
    socketEventsTotal.inc();
    socketEventsByName.inc({ event: eventName });
}

export function buildMetricsText() {
    return register.metrics();
}

export function metricsMiddleware(req, res, next) {
    const startedAt = Date.now();
    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        res.locals.requestDurationMs = durationMs;
        const routePath = req.route?.path || req.originalUrl || req.url;
        observeHttpRequest({
            method: req.method,
            routePath,
            statusCode: res.statusCode,
            durationMs,
        });
    });
    next();
}

