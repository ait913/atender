import type { CreateFriendshipInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";

const userSelect = { id: true, name: true, handle: true, image: true } as const;

export function friendshipDto(friendship: {
  id: string;
  sender: { id: string; name: string | null; handle: string | null; image: string | null };
  receiver: { id: string; name: string | null; handle: string | null; image: string | null };
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
  createdAt: Date;
  acceptedAt: Date | null;
}) {
  return {
    id: friendship.id,
    sender: friendship.sender,
    receiver: friendship.receiver,
    status: friendship.status,
    createdAt: friendship.createdAt.toISOString(),
    acceptedAt: friendship.acceptedAt?.toISOString() ?? null,
  };
}

async function findFullFriendship(id: string) {
  return prisma.friendship.findUniqueOrThrow({
    where: { id },
    include: { sender: { select: userSelect }, receiver: { select: userSelect } },
  });
}

async function resolveReceiver(input: CreateFriendshipInput) {
  if (input.receiverId) return prisma.user.findUnique({ where: { id: input.receiverId }, select: { id: true } });
  if (input.receiverInviteCode) return prisma.user.findUnique({ where: { inviteCode: input.receiverInviteCode }, select: { id: true } });
  if (input.receiverHandle) {
    const handle = input.receiverHandle.replace(/^@/, "").toLowerCase();
    return prisma.user.findUnique({ where: { handle }, select: { id: true } });
  }
  return null;
}

export async function listFriendships(userId: string, query: { status?: string; direction?: string }) {
  const status = query.status as "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED" | undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(query.direction === "sent"
      ? { senderId: userId }
      : query.direction === "received"
        ? { receiverId: userId }
        : { OR: [{ senderId: userId }, { receiverId: userId }] }),
  };
  return prisma.friendship.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { sender: { select: userSelect }, receiver: { select: userSelect } },
  });
}

export async function createFriendship(senderId: string, input: CreateFriendshipInput) {
  const receiver = await resolveReceiver(input);
  if (!receiver) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  if (receiver.id === senderId) throw new AppError(409, "SELF_FRIENDSHIP", "Cannot send a friendship request to yourself");

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId, receiverId: receiver.id },
        { senderId: receiver.id, receiverId: senderId },
      ],
    },
    include: { sender: { select: userSelect }, receiver: { select: userSelect } },
  });

  if (existing) {
    if (existing.status === "ACCEPTED") throw new AppError(409, "ALREADY_FRIEND", "Already friends");
    if (existing.status === "BLOCKED") {
      if (existing.senderId === receiver.id) throw new AppError(404, "USER_NOT_FOUND", "User not found");
      throw new AppError(409, "YOU_BLOCKED_THIS_USER", "You blocked this user");
    }
    if (existing.status === "PENDING") {
      if (existing.senderId === receiver.id && existing.receiverId === senderId) {
        const updated = await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
          include: { sender: { select: userSelect }, receiver: { select: userSelect } },
        });
        return updated;
      }
      return existing;
    }
    const updated = await prisma.friendship.update({
      where: { id: existing.id },
      data: { senderId, receiverId: receiver.id, status: "PENDING", acceptedAt: null },
      include: { sender: { select: userSelect }, receiver: { select: userSelect } },
    });
    return updated;
  }

  return prisma.friendship.create({
    data: { senderId, receiverId: receiver.id, status: "PENDING" },
    include: { sender: { select: userSelect }, receiver: { select: userSelect } },
  });
}

export async function acceptFriendship(userId: string, id: string) {
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) throw new AppError(404, "NOT_FOUND", "Friendship not found");
  if (friendship.receiverId !== userId) throw new AppError(403, "NOT_RECEIVER", "Only receiver can accept");
  if (friendship.status !== "PENDING") throw new AppError(409, "NOT_PENDING", "Friendship is not pending");
  await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  return findFullFriendship(id);
}

export async function declineFriendship(userId: string, id: string) {
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) throw new AppError(404, "NOT_FOUND", "Friendship not found");
  if (friendship.receiverId !== userId) throw new AppError(403, "NOT_RECEIVER", "Only receiver can decline");
  if (friendship.status !== "PENDING") throw new AppError(409, "NOT_PENDING", "Friendship is not pending");
  await prisma.friendship.update({ where: { id }, data: { status: "DECLINED", acceptedAt: null } });
  return findFullFriendship(id);
}

export async function cancelFriendship(userId: string, id: string) {
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) throw new AppError(404, "NOT_FOUND", "Friendship not found");
  if (friendship.senderId !== userId) throw new AppError(403, "NOT_SENDER", "Only sender can cancel");
  if (friendship.status !== "PENDING") throw new AppError(409, "NOT_PENDING", "Friendship is not pending");
  await prisma.friendship.delete({ where: { id } });
}

export async function blockFriendship(userId: string, id: string) {
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) throw new AppError(404, "NOT_FOUND", "Friendship not found");
  const blockedId = friendship.senderId === userId ? friendship.receiverId : friendship.senderId;
  if (blockedId === userId) throw new AppError(409, "SELF_FRIENDSHIP", "Cannot block yourself");
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { senderId: userId, receiverId: blockedId },
        { senderId: blockedId, receiverId: userId },
      ],
    },
  });
  return prisma.friendship.create({
    data: { senderId: userId, receiverId: blockedId, status: "BLOCKED" },
    include: { sender: { select: userSelect }, receiver: { select: userSelect } },
  });
}

export async function deleteFriendship(userId: string, id: string) {
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) throw new AppError(404, "NOT_FOUND", "Friendship not found");
  if (friendship.senderId !== userId && friendship.receiverId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  await prisma.friendship.delete({ where: { id } });
}

export async function searchUsers(userId: string, rawHandle: string) {
  const handle = rawHandle.replace(/^@/, "").toLowerCase();
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      handle: { startsWith: handle },
      receivedFriendships: { none: { senderId: userId, status: "BLOCKED" } },
    },
    select: userSelect,
    orderBy: { handle: "asc" },
    take: 10,
  });
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: { in: users.map((user) => user.id) } },
        { receiverId: userId, senderId: { in: users.map((user) => user.id) } },
      ],
    },
  });
  return users.map((user) => ({
    ...user,
    friendshipStatus: friendships.find((friendship) => friendship.senderId === user.id || friendship.receiverId === user.id)?.status ?? null,
  }));
}
