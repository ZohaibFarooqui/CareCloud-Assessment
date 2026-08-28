const { PrismaClient } = require('@prisma/client');

// Serverless invocations can reuse a warm container. Cache the client on the
// global so we don't open a new pool on every request and exhaust Postgres.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__carecloudPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (!globalForPrisma.__carecloudPrisma) {
  globalForPrisma.__carecloudPrisma = prisma;
}

module.exports = { prisma };
