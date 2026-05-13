import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, type SchoolKind } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.resolve(__dirname, "../prisma/seed-data");
const preferred = path.join(seedDir, "mext-schools.csv");
const fallback = path.join(seedDir, "mext-schools-sample.csv");

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === "\"" && quoted && next === "\"") {
      current += "\"";
      i += 1;
    } else if (ch === "\"") {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

async function main() {
  const csvPath = existsSync(preferred) ? preferred : fallback;
  const text = await readFile(csvPath, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const rows = lines.slice(1).map(parseCsvLine);
  let count = 0;

  for (const [mextCode, kind, name, nameKana, prefecture] of rows) {
    if (!mextCode || !kind || !name) continue;
    await prisma.school.upsert({
      where: { mextCode },
      update: {
        kind: kind as SchoolKind,
        name,
        nameKana: nameKana || null,
        prefecture: prefecture || null,
      },
      create: {
        mextCode,
        kind: kind as SchoolKind,
        name,
        nameKana: nameKana || null,
        prefecture: prefecture || null,
      },
    });
    count += 1;
  }

  console.log(`Seeded ${count} schools from ${path.basename(csvPath)}`);
}

await main()
  .finally(async () => prisma.$disconnect());
