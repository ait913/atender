import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const tmpDir = path.resolve(process.cwd(), "tests/.tmp");
const templateDbPath = path.join(tmpDir, "template.db");
const currentDbPath = path.join(tmpDir, "current-test.db");

let templateReady = false;
let prisma: PrismaClient | null = null;

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

export function createTestDb(): TestDb {
  ensureTemplateDb();
  removeSqliteFiles(currentDbPath);
  fs.copyFileSync(templateDbPath, currentDbPath);

  process.env.DATABASE_URL = sqliteUrl(currentDbPath);
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: sqliteUrl(currentDbPath),
      },
    },
  });

  return {
    path: currentDbPath,
    url: sqliteUrl(currentDbPath),
    prisma,
  };
}

export async function resetPrisma() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
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
