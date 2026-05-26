import { z } from "zod";

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const UserDto = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  handle: z.string().nullable(),
  inviteCode: z.string().nullable(),
  defaultSemesterId: z.string().nullable(),
  schoolId: z.string().nullable(),
  departmentId: z.string().nullable(),
});

export type ErrorResponse = z.infer<typeof ErrorResponse>;
export type UserDto = z.infer<typeof UserDto>;
