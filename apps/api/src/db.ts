import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient | null };

let _prisma: PrismaClient | null = globalForPrisma.prisma ?? null;

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : undefined,
  );
}

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = createPrismaClient(process.env.DATABASE_URL);
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = _prisma;
    }
  }
  return _prisma;
}

export function setPrisma(client: PrismaClient) {
  _prisma = client;
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrisma(), property, receiver);
  },
  set(_target, property, value, receiver) {
    return Reflect.set(getPrisma(), property, value, receiver);
  },
}) as PrismaClient;
