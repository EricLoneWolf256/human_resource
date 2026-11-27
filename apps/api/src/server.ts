import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { logEvent } from './logger.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  logEvent('api.started', { port: config.PORT, environment: config.NODE_ENV });
});

async function shutdown() {
  logEvent('api.shutdown');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
