import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";

import {
  SESSION_MAX_AGE_SECONDS,
  SIWE_NONCE_COOKIE,
  SIWE_SESSION_COOKIE,
  type WalletSession,
} from "@/lib/auth";

type RequestBody = {
  message?: string;
  signature?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RequestBody;
  if (!body.message || !body.signature) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const nonce = request.cookies.get(SIWE_NONCE_COOKIE)?.value;
  if (!nonce) {
    return NextResponse.json({ error: "nonce_missing" }, { status: 400 });
  }

  try {
    const siweMessage = new SiweMessage(body.message);
    const hostHeader = request.headers.get("host") ?? siweMessage.domain;
    const hostname = hostHeader.split(":")[0];
    const verification = await siweMessage.verify({
      signature: body.signature,
      nonce,
      domain: hostname,
    });

    if (!verification.success) {
      return NextResponse.json({ error: "verification_failed" }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    const session: WalletSession = {
      address: siweMessage.address,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const response = NextResponse.json({ ok: true, address: session.address, expiresAt: session.expiresAt });
    response.cookies.delete(SIWE_NONCE_COOKIE);
    response.cookies.set(SIWE_SESSION_COOKIE, JSON.stringify(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "verification_error" }, { status: 400 });
  }
}


