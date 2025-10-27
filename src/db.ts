import { PrismaClient } from './generated/prisma/client.js';

export const prisma = new PrismaClient();

if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}
