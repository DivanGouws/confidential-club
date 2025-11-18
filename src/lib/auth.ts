export const SIWE_NONCE_COOKIE = "cc_siwe_nonce";
export const SIWE_SESSION_COOKIE = "cc_siwe_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

export type WalletSession = {
  address: string;
  issuedAt: string;
  expiresAt: string;
};

export function isSessionExpired(session: WalletSession): boolean {
  return Date.now() >= Date.parse(session.expiresAt);
}


