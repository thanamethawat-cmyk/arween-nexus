"use client";

import { createContext, useContext } from "react";
import type { Session } from "@/lib/demo-auth";

export type AuthValue = {
  session: Session;
  signOut: () => void;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue | null {
  return useContext(AuthContext);
}
