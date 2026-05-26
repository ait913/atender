import type { FriendshipStatus, PrismaClient } from "@prisma/client";

export async function createFriendship(
  prisma: PrismaClient,
  args: {
    senderId: string;
    receiverId: string;
    status?: FriendshipStatus;
    acceptedAt?: Date | null;
  },
) {
  return prisma.friendship.create({
    data: {
      senderId: args.senderId,
      receiverId: args.receiverId,
      status: args.status ?? "PENDING",
      acceptedAt: args.acceptedAt,
    },
  });
}

export async function setUserHandle(
  prisma: PrismaClient,
  userId: string,
  handle: string,
) {
  return prisma.user.update({
    where: { id: userId },
    data: { handle },
  });
}
