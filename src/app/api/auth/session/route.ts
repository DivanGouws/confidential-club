import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  SIWE_SESSION_COOKIE,
  type WalletSession,
  isSessionExpired,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const raw = request.cookies.get(SIWE_SESSION_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const session = JSON.parse(raw) as WalletSession;
    
    if (isSessionExpired(session)) {
      const response = NextResponse.json({ authenticated: false });
      response.cookies.delete(SIWE_SESSION_COOKIE);
      return response;
    }

    const currentAddress = request.nextUrl.searchParams.get("address");
    
    if (currentAddress && session.address.toLowerCase() !== currentAddress.toLowerCase()) {
      const response = NextResponse.json({ authenticated: false });
      response.cookies.delete(SIWE_SESSION_COOKIE);
      return response;
    }

    return NextResponse.json({ authenticated: true, address: session.address, issuedAt: session.issuedAt, expiresAt: session.expiresAt });
  } catch (error) {
    console.error(error);
    const response = NextResponse.json({ authenticated: false });
    response.cookies.delete(SIWE_SESSION_COOKIE);
    return response;
  }
}


