import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  console.log(`HR API listening on http://localhost:${config.PORT}/api`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
