import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";
import { createRoom, addRoomMember } from "./helpers/seedRoom";

describe("room personal-calendar-share projection", () => {
  // M1
  it("[M1] GET returns null before a room member creates a share", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });

    const res = await app.request(
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        headers: { Cookie: u.cookie },
      },
    );
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ share: null });
  });

  // M2
  it("[M2] POST creates a share and projects the caller's personal events into room events", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        date: "2026-07-25",
        title: "共有する予定",
        isAllDay: false,
        startMinute: 540,
        endMinute: 630,
      },
    });

    const res = await requestJson(
      app,
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "POST",
        headers: { Cookie: u.cookie },
        body: { visibilityMode: "NORMAL" },
      },
    );
    const body = (await json(res)) as any;
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
    });

    expect(res.status).toBe(201);
    expect(body.share).toMatchObject({
      roomId: room.id,
      userId: u.user.id,
      visibilityMode: "NORMAL",
    });
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      roomId: room.id,
      authorId: u.user.id,
      title: "共有する予定",
      source: "PERSONAL",
    });
  });

  // M3
  it("[M3] projects only events in the today-to-three-month range", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    for (const body of [
      { date: "2026-07-25", title: "range start", isAllDay: true },
      { date: "2026-09-20", title: "range later", isAllDay: true },
      { date: "2026-05-01", title: "past", isAllDay: true },
    ]) {
      await requestJson(app, "/api/personal-events", {
        method: "POST",
        headers: { Cookie: u.cookie },
        body,
      });
    }

    const res = await requestJson(
      app,
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "POST",
        headers: { Cookie: u.cookie },
        body: { visibilityMode: "NORMAL" },
      },
    );
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
      orderBy: { title: "asc" },
    });

    expect(res.status).toBe(201);
    expect(projected.map((e) => e.title)).toEqual([
      "range later",
      "range start",
    ]);
  });


  // M3 (design): TITLE_MAPPED + CONTAINS "デート"->"予定" ルール一致 → "予定"
  //              かつ ルール不一致 "会議" は素通し (M4 design: default catch-all は個人共有では除外)
  it("[M3/M4] TITLE_MAPPED applies matching rule and passes through non-matching titles", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await requestJson(app, "/api/me/ics-title-rules", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { matchType: "CONTAINS", pattern: "デート", replaceWith: "予定" },
    });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { date: "2026-07-25", title: "デートの予定", isAllDay: true },
    });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { date: "2026-07-26", title: "会議", isAllDay: true },
    });

    const res = await requestJson(
      app,
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "POST",
        headers: { Cookie: u.cookie },
        body: { visibilityMode: "TITLE_MAPPED" },
      },
    );
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
      orderBy: { start: "asc" },
    });

    expect(res.status).toBe(201);
    // M3: 一致は "予定" にマスク。rawTitle は原文保持
    const mapped = projected.find((e) => e.rawTitle === "デートの予定");
    expect(mapped?.title).toBe("予定");
    // M4: 不一致 "会議" は素通し (default catch-all は個人共有で除外)
    const passthrough = projected.find((e) => e.rawTitle === "会議");
    expect(passthrough?.title).toBe("会議");
  });

  // M5
  it("[M5] BUSY_ONLY projects busy titles while preserving personal source projection", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        date: "2026-07-25",
        title: "非公開タイトル",
        isAllDay: false,
        startMinute: 600,
        endMinute: 660,
      },
    });

    const res = await requestJson(
      app,
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "POST",
        headers: { Cookie: u.cookie },
        body: { visibilityMode: "BUSY_ONLY" },
      },
    );
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
    });

    expect(res.status).toBe(201);
    expect(projected).toHaveLength(1);
    expect(projected[0].visibilityMode).toBe("BUSY_ONLY");
    expect(projected[0].title).not.toBe("非公開タイトル");
  });

  // M6
  it("[M6] updating a share replaces stale personal projections for that user and room", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { date: "2026-07-25", title: "更新対象", isAllDay: true },
    });
    await requestJson(app, `/api/rooms/${room.id}/personal-calendar-share`, {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { visibilityMode: "BUSY_ONLY" },
    });

    const res = await requestJson(
      app,
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "POST",
        headers: { Cookie: u.cookie },
        body: { visibilityMode: "NORMAL" },
      },
    );
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
    });

    expect(res.status).toBe(201);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      title: "更新対象",
      visibilityMode: "NORMAL",
    });
  });

  // M7
  it("[M7] DELETE removes the share and its projected personal room events", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { date: "2026-07-25", title: "削除対象", isAllDay: true },
    });
    await requestJson(app, `/api/rooms/${room.id}/personal-calendar-share`, {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { visibilityMode: "NORMAL" },
    });

    const res = await app.request(
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "DELETE",
        headers: { Cookie: u.cookie },
      },
    );
    const body = (await json(res)) as any;
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
    });

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(projected).toEqual([]);
  });

  // M8
  it("[M8] non-members cannot get, create, or delete a room personal-calendar-share", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const outsider = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const getRes = await app.request(
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        headers: { Cookie: outsider.cookie },
      },
    );
    const postRes = await requestJson(
      app,
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "POST",
        headers: { Cookie: outsider.cookie },
        body: { visibilityMode: "NORMAL" },
      },
    );
    const deleteRes = await app.request(
      `/api/rooms/${room.id}/personal-calendar-share`,
      {
        method: "DELETE",
        headers: { Cookie: outsider.cookie },
      },
    );

    expect(getRes.status).toBe(403);
    expect(((await json(getRes)) as any).error.code).toBe("NOT_MEMBER");
    expect(postRes.status).toBe(403);
    expect(((await json(postRes)) as any).error.code).toBe("NOT_MEMBER");
    expect(deleteRes.status).toBe(403);
    expect(((await json(deleteRes)) as any).error.code).toBe("NOT_MEMBER");
  });

  // M9
  it("[M9] each room member's share projects only that member's personal events", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: other.user.id });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: owner.cookie },
      body: { date: "2026-07-25", title: "owner personal", isAllDay: true },
    });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: other.cookie },
      body: { date: "2026-07-26", title: "member personal", isAllDay: true },
    });

    await requestJson(app, `/api/rooms/${room.id}/personal-calendar-share`, {
      method: "POST",
      headers: { Cookie: other.cookie },
      body: { visibilityMode: "NORMAL" },
    });
    const projected = await db.roomEvent.findMany({
      where: { roomId: room.id, source: "PERSONAL" },
    });

    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      authorId: other.user.id,
      title: "member personal",
    });
  });
});
