import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Resolver o caminho absoluto do banco de dados
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Processar DATABASE_URL - converter para caminho absoluto
let databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';

// Remover prefixo "file:" se presente para obter um caminho de arquivo
let databasePath = databaseUrl.startsWith('file:') 
  ? databaseUrl.slice(5) 
  : databaseUrl;

// Converter para caminho absoluto se for relativo
if (!databasePath.startsWith('/')) {
  databasePath = resolve(__dirname, '../../' + databasePath);
}

process.env.DATABASE_URL = `file:${databasePath}`;

console.log('[Prisma] Database URL:', databaseUrl);
console.log('[Prisma] Database path:', databasePath);

const adapter = new PrismaBetterSqlite3({ url: `file:${databasePath}` });

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;