import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient, setPrisma } from "../../src/db";

const tmpDir = path.resolve(process.cwd(), "tests/.tmp");
const templateDbPath = path.join(tmpDir, "template.db");
const currentDbPath = path.join(tmpDir, "current-test.db");

let templateReady = false;
let prisma: PrismaClient | null = null;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export type TestDb = {
  path: string;
  url: string;
  prisma: PrismaClient;
};

function sqliteUrl(dbPath: string) {
  return `file:${dbPath}`;
}

function removeSqliteFiles(dbPath: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function resetAppAuth() {
  const { resetAuth } = await import("../../src/auth");
  resetAuth();
}

export function installTestPrisma() {
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = sqliteUrl(currentDbPath);
  prisma ??= globalForPrisma.prisma ?? createPrismaClient(sqliteUrl(currentDbPath));
  globalForPrisma.prisma = prisma;
  setPrisma(prisma);
  return prisma;
}

export function ensureTemplateDb() {
  fs.mkdirSync(tmpDir, { recursive: true });
  if (templateReady && fs.existsSync(templateDbPath)) return;

  removeSqliteFiles(templateDbPath);
  process.env.DATABASE_URL = sqliteUrl(templateDbPath);
  execSync("npx prisma migrate deploy --schema=./prisma/schema.prisma", {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: sqliteUrl(templateDbPath) },
  });
  templateReady = true;
}

export async function createTestDb(): Promise<TestDb> {
  ensureTemplateDb();
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  removeSqliteFiles(currentDbPath);
  fs.copyFileSync(templateDbPath, currentDbPath);

  process.env.DATABASE_URL = sqliteUrl(currentDbPath);
  const client = createPrismaClient(sqliteUrl(currentDbPath));
  prisma = client;
  globalForPrisma.prisma = client;
  setPrisma(client);
  await resetAppAuth();

  return {
    path: currentDbPath,
    url: sqliteUrl(currentDbPath),
    prisma: client,
  };
}

export async function resetPrisma() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
  globalForPrisma.prisma = null;
  await resetAppAuth();
}

export async function disposeTestDb(dbPath = currentDbPath) {
  await resetPrisma();
  removeSqliteFiles(dbPath);
}

export function getPrisma() {
  if (!prisma) {
    throw new Error("Test PrismaClient is not initialized. Did tests/setup.ts beforeEach run?");
  }
  return prisma;
}

export async function enableForeignKeys(client = getPrisma()) {
  await client.$executeRawUnsafe("PRAGMA foreign_keys=ON");
}

export function uniqueId(prefix = "test") {
  return `${prefix}_${randomUUID()}`;
}
