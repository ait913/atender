import { z } from "zod";
import { FRIENDSHIP_STATUS } from "../enums.js";

export const FriendshipStatusEnum = z.enum(FRIENDSHIP_STATUS);

export const FriendshipUserDto = z.object({
  id: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  image: z.string().nullable(),
});

export const FriendshipDto = z.object({
  id: z.string(),
  sender: FriendshipUserDto,
  receiver: FriendshipUserDto,
  status: FriendshipStatusEnum,
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
});

export const CreateFriendshipInput = z.object({
  receiverHandle: z.string().min(1).optional(),
  receiverInviteCode: z.string().min(1).optional(),
  receiverId: z.string().min(1).optional(),
}).refine(
  (value) => [value.receiverHandle, value.receiverInviteCode, value.receiverId].filter(Boolean).length === 1,
  { message: "exactly one receiver identifier is required" },
);

export const UserSearchDto = FriendshipUserDto.extend({
  friendshipStatus: FriendshipStatusEnum.nullable(),
});

export type FriendshipDto = z.infer<typeof FriendshipDto>;
export type FriendshipUserDto = z.infer<typeof FriendshipUserDto>;
export type CreateFriendshipInput = z.infer<typeof CreateFriendshipInput>;
export type UserSearchDto = z.infer<typeof UserSearchDto>;
