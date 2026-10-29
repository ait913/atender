-- A2: カレンダー機能のテーブルを削除 (子 → 親の順)
PRAGMA foreign_keys=OFF;
DROP TABLE "RoomEventOverride";
DROP TABLE "RoomEvent";
DROP TABLE "IcsImport";
DROP TABLE "IcsTitleRule";
DROP TABLE "GoogleCalendarSync";
DROP TABLE "GoogleCalendarConnection";
DROP TABLE "PersonalCalendarShare";
DROP TABLE "PersonalEventOverride";
DROP TABLE "PersonalEvent";
PRAGMA foreign_keys=ON;
