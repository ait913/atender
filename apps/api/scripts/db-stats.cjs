// 起動時 (migrate の前後) に主要テーブルの件数を 1 行で stdout に出す。
// 目的: table を作り直す migration の前後で行数が一致することを、ssh 無しに Coolify のログ API から確認する。
// 使い方: node scripts/db-stats.cjs <label>   (DATABASE_URL = file:<path>)
const Database = require("better-sqlite3");

const label = process.argv[2] || "";
const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
const path = url.replace(/^file:/, "").split("?")[0];
const tables = [
  "User",
  "Account",
  "Room",
  "RoomMembership",
  "RoomEvent",
  "RoomEventOverride",
  "TimetableTemplate",
  "TemplateDaySlot",
  "TemplateCourse",
  "TemplateMeeting",
  "UserTimetable",
  "MeetingOccurrence",
  "AttendanceRecord",
];

let db;
try {
  db = new Database(path, { readonly: true, fileMustExist: true });
} catch (e) {
  console.log(`db-stats ${label}: no database at ${path} (${e.code || e.message})`);
  process.exit(0);
}
const existing = new Set(
  db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name),
);
const parts = tables.map((t) => {
  if (!existing.has(t)) return `${t}=-`;
  const row = db.prepare(`select count(*) as n from "${t}"`).get();
  return `${t}=${row.n}`;
});
const fk = db.prepare("select count(*) as n from pragma_foreign_key_check").get().n;
console.log(`db-stats ${label}: ${parts.join(" ")} fk_violations=${fk}`);
db.close();
