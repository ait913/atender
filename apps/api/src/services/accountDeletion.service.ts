import { prisma } from "../db";
import { readAppleCredentialsConfig } from "./appleAuthorization.service";
import { collectRevocableTokens, revokeTokens, type RevokeOutcome } from "./tokenRevocation.service";

export type AccountDeletionSummary = {
  deleted: boolean; // User 行を消したら true (二重送信の 2 本目が先に消していたら false)
  transferredRoomIds: string[]; // id 昇順
  deletedRoomIds: string[]; // id 昇順
  revocations: RevokeOutcome[];
};

export async function deleteUserData(userId: string): Promise<Omit<AccountDeletionSummary, "revocations">> {
  const deletedRoomIds: string[] = [];
  const transferredRoomIds: string[] = [];
  let deleted = false;

  await prisma.$transaction(async (tx) => {
    // (a) 退会者が所有するルーム
    const owned = await tx.room.findMany({
      where: { OR: [{ createdByUserId: userId }, { memberships: { some: { userId, role: "OWNER" } } }] },
      select: { id: true },
    });
    for (const room of owned) {
      const successor = await tx.roomMembership.findFirst({
        where: { roomId: room.id, userId: { not: userId } },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      });
      if (!successor) {
        await tx.room.delete({ where: { id: room.id } }); // Cascade で Membership / RoomEvent / IcsImport / Sync / Share も消える
        deletedRoomIds.push(room.id);
        continue;
      }
      if (successor.role !== "OWNER") {
        await tx.roomMembership.update({ where: { id: successor.id }, data: { role: "OWNER" } });
      }
      await tx.room.update({ where: { id: room.id }, data: { createdByUserId: successor.userId } });
      transferredRoomIds.push(room.id);
    }
    // (b) 写しを明示削除
    await tx.roomEvent.deleteMany({ where: { authorId: userId, source: { in: ["PERSONAL", "GOOGLE_OAUTH"] } } });
    // (c) 非公開テンプレを明示削除
    await tx.timetableTemplate.deleteMany({ where: { authorUserId: userId, isPublic: false } });
    // (d) 本体。残りは FK の Cascade / SetNull に任せる
    const { count } = await tx.user.deleteMany({ where: { id: userId } });
    deleted = count === 1;
  });

  return {
    deleted,
    transferredRoomIds: transferredRoomIds.sort(),
    deletedRoomIds: deletedRoomIds.sort(),
  };
}

const inFlight = new Map<string, Promise<AccountDeletionSummary>>();

async function runDeletion(userId: string): Promise<AccountDeletionSummary> {
  const tokens = await collectRevocableTokens(userId); // User 削除前に Account を読む
  const summary = await deleteUserData(userId); // 1 つの tx
  const revocations = await revokeTokens(tokens, { apple: readAppleCredentialsConfig() }); // commit 後。失敗はログのみ
  return { ...summary, revocations };
}

export function deleteAccount(userId: string): Promise<AccountDeletionSummary> {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const promise = runDeletion(userId).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, promise);
  return promise;
}
