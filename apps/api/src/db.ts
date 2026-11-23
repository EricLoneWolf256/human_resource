import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

export const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: { db: { url: config.DATABASE_URL } },
});

export type Db = typeof prisma;
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];