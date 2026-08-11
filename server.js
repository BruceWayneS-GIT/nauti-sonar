const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Background crawls run in this process. If one dies from an uncaught error
// the crawl job is left RUNNING with no explanation anywhere — the database
// logging cannot record its own process dying. These handlers put the reason
// in stderr, which Plesk captures in the Node.js error log.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

// Passenger stops a process by signalling it. Recording that distinguishes
// "the platform recycled us" from "we crashed", which look identical from
// the outside once the job is swept.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.error(`[SHUTDOWN] received ${signal} after ${Math.round(process.uptime())}s, heap ${mb}MB`);
    process.exit(0);
  });
}

const app = next({ dir: __dirname, dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(process.env.PORT || 3000, () => {
    console.log('> Ready on port ' + (process.env.PORT || 3000));
  });
});
