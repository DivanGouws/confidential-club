import { NextResponse } from "next/server";
import { generateNonce } from "siwe";

import { SESSION_MAX_AGE_SECONDS, SIWE_NONCE_COOKIE } from "@/lib/auth";

export async function GET() {
  const nonce = generateNonce();
  const response = NextResponse.json({ nonce });
  response.cookies.set(SIWE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}


