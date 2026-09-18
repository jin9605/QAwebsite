import { NextResponse } from "next/server";

export function middleware() {
  return new NextResponse("QA Ticket Desk는 현재 점검 중입니다.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "3600" },
  });
}

export const config = { matcher: "/:path*" };
