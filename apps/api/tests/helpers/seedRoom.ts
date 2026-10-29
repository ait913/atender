import type { PrismaClient, RoomRole } from "@prisma/client";

export async function createRoom(
  prisma: PrismaClient,
  args: {
    ownerId: string;
    name?: string;
    description?: string | null;
    inviteCode?: string;
    inviteExpiresAt?: Date | null;
  },
) {
  const room = await prisma.room.create({
    data: {
      name: args.name ?? "Study Room",
      description: args.description,
      inviteCode: args.inviteCode,
      inviteExpiresAt: args.inviteExpiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByUserId: args.ownerId,
    },
  });

  await prisma.roomMembership.create({
    data: {
      roomId: room.id,
      userId: args.ownerId,
      role: "OWNER",
      joinedAt: new Date("2026-05-01T00:00:00.000Z"),
    },
  });

  return room;
}

export async function addRoomMember(
  prisma: PrismaClient,
  args: {
    roomId: string;
    userId: string;
    role?: RoomRole;
    joinedAt?: Date;
  },
) {
  return prisma.roomMembership.create({
    data: {
      roomId: args.roomId,
      userId: args.userId,
      role: args.role ?? "MEMBER",
      joinedAt: args.joinedAt,
    },
  });
}
