import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { contentTooLarge, uploadTooBigMessage } from "@/lib/demo-limits";

export function middleware(request: NextRequest) {
  if (request.method === "POST" && contentTooLarge(request)) {
    return NextResponse.json({ error: uploadTooBigMessage() }, { status: 413 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/analyze",
};
