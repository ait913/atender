import { createAuthClient } from "better-auth/react";
import { API_URL } from "@/api/client";

export const authClient = createAuthClient({
  baseURL: API_URL,
});
