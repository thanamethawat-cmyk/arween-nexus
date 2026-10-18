import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<{ ip: string }>();

export function currentIp(): string {
  return requestContext.getStore()?.ip ?? "unknown";
}
