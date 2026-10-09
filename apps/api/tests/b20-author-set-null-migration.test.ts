import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { prisma } from "./helpers/app";

const MIGRATION_SUFFIX = "_b20_author_set_null";
const apiRoot = process.cwd();
const migrationsDir = path.join(apiRoot, "prisma", "migrations");

type PragmaCol = { name: string; notnull: number };
type PragmaFk = { table: string; from: string; on_delete: string };

describe("[B20 #M] author SET NULL migration", () => {
  it("#M1 TimetableTemplate.authorUserId and RoomEvent.authorId are nullable", async () => {
    const t = (await prisma().$queryRawUnsafe(`PRAGMA table_info("TimetableTemplate")`)) as PragmaCol[];
    const r = (await prisma().$queryRawUnsafe(`PRAGMA table_info("RoomEvent")`)) as PragmaCol[];
    expect(Number(t.find((c) => c.name === "authorUserId")!.notnull)).toBe(0);
    expect(Number(r.find((c) => c.name === "authorId")!.notnull)).toBe(0);
  });

  it("#M2 FK actions: author -> SET NULL, others unchanged (CASCADE)", async () => {
    const tf = (await prisma().$queryRawUnsafe(`PRAGMA foreign_key_list("TimetableTemplate")`)) as PragmaFk[];
    const rf = (await prisma().$queryRawUnsafe(`PRAGMA foreign_key_list("RoomEvent")`)) as PragmaFk[];
    const act = (list: PragmaFk[], from: string) => list.find((f) => f.from === from)!.on_delete;
    expect(act(tf, "authorUserId")).toBe("SET NULL");
    expect(act(rf, "authorId")).toBe("SET NULL");
    expect(act(rf, "roomId")).toBe("CASCADE");
    expect(act(tf, "schoolId")).toBe("CASCADE");
    expect(act(tf, "departmentId")).toBe("CASCADE");
  });

  it("#M3 applying the migration over existing data preserves rows and FK children", () => {
    const folders = fs.readdirSync(migrationsDir).filter((n) => fs.statSync(path.join(migrationsDir, n)).isDirectory());
    const mine = folders.filter((n) => n.endsWith(MIGRATION_SUFFIX));
    expect(mine).toHaveLength(1);
    // it must be the last migration
    expect([...folders].sort().at(-1)).toBe(mine[0]);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b20-mig-"));
    try {
      const prismaDir = path.join(tmp, "prisma");
      fs.mkdirSync(path.join(prismaDir, "migrations"), { recursive: true });
      fs.copyFileSync(path.join(apiRoot, "prisma", "schema.prisma"), path.join(prismaDir, "schema.prisma"));
      fs.copyFileSync(path.join(migrationsDir, "migration_lock.toml"), path.join(prismaDir, "migrations", "migration_lock.toml"));
      for (const f of folders) {
        if (f === mine[0]) continue;
        fs.cpSync(path.join(migrationsDir, f), path.join(prismaDir, "migrations", f), { recursive: true });
      }
      const dbPath = path.join(tmp, "m.db");
      const env = { ...process.env, DATABASE_URL: `file:${dbPath}` };
      const deploy = () =>
        execFileSync("npx", ["prisma", "migrate", "deploy", `--schema=${path.join(prismaDir, "schema.prisma")}`], {
          cwd: apiRoot,
          env,
          stdio: "pipe",
        });
      deploy();

      // ---- insert fixture rows using column metadata (NOT NULL cols w/o default get dummies) ----
      const db = new Database(dbPath);
      db.pragma("foreign_keys = ON");
      const now = new Date("2026-05-01T00:00:00.000Z").getTime();
      const insert = (table: string, values: Record<string, unknown>) => {
        const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as {
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
        }[];
        const row: Record<string, unknown> = { ...values };
        for (const c of cols) {
          if (c.name in row) continue;
          if (c.notnull && c.dflt_value === null) {
            const t = c.type.toUpperCase();
            row[c.name] = t.includes("INT") || t.includes("BOOL") ? 0 : t.includes("DATETIME") ? now : t.includes("REAL") ? 0 : `${table}-${c.name}-${String(values.id)}`;
          }
        }
        const keys = Object.keys(row);
        db.prepare(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(
          ...keys.map((k) => row[k]),
        );
      };
      insert("User", { id: "u1", email: "u1@example.test" });
      insert("User", { id: "u2", email: "u2@example.test" });
      insert("School", { id: "s1", name: "S" });
      insert("Department", { id: "d1", schoolId: "s1", name: "D" });
      insert("TimetableTemplate", { id: "t1", authorUserId: "u1", schoolId: "s1", departmentId: "d1", title: "T" });
      insert("TemplateDaySlot", { id: "tds1", templateId: "t1", periodIndex: 1 });
      insert("TemplateCourse", { id: "tc1", templateId: "t1", name: "C" });
      insert("TemplateMeeting", { id: "tm1", templateId: "t1", courseId: "tc1" });
      insert("Semester", { id: "sem1", userId: "u2", name: "S" });
      insert("UserTimetable", { id: "ut1", userId: "u2", semesterId: "sem1", sourceTemplateId: "t1" });
      insert("Room", { id: "r1", name: "R", inviteCode: "inv1", createdByUserId: "u1" });
      insert("RoomEvent", { id: "re1", roomId: "r1", authorId: "u1", title: "E" });
      insert("RoomEventOverride", { id: "reo1", seriesId: "re1" });

      const tables = [
        "User",
        "School",
        "Department",
        "TimetableTemplate",
        "TemplateDaySlot",
        "TemplateCourse",
        "TemplateMeeting",
        "UserTimetable",
        "Room",
        "RoomEvent",
        "RoomEventOverride",
      ];
      const counts = () => Object.fromEntries(tables.map((t) => [t, (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as any).n]));
      const before = counts();
      expect(before.TimetableTemplate).toBe(1);
      expect(before.RoomEventOverride).toBe(1);
      db.close();

      // ---- apply the b20 migration via prisma migrate deploy ----
      fs.cpSync(path.join(migrationsDir, mine[0]), path.join(prismaDir, "migrations", mine[0]), { recursive: true });
      deploy();

      const after = new Database(dbPath);
      after.pragma("foreign_keys = ON");
      const afterCounts = Object.fromEntries(
        tables.map((t) => [t, (after.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as any).n]),
      );
      expect(afterCounts).toEqual(before);
      expect((after.prepare(`SELECT "sourceTemplateId" AS s FROM "UserTimetable" WHERE id='ut1'`).get() as any).s).toBe("t1");
      expect(after.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);
      // and the new FK action is really in effect on the migrated DB
      expect(
        (after.prepare(`PRAGMA table_info("TimetableTemplate")`).all() as PragmaCol[]).find((c) => c.name === "authorUserId")!.notnull,
      ).toBe(0);
      after.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
