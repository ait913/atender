import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { app } from "../../src/index";
import { getPrisma } from "./db";

export { app };

export function prisma(): PrismaClient {
  return getPrisma();
}

export type TestApp = Hono;
