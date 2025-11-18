import CryptoJS from "crypto-js";

export function encryptText(text: string, key: string): string {
  const encrypted = CryptoJS.AES.encrypt(text, key).toString();
  return encrypted;
}

export function decryptText(encryptedText: string, key: string): string {
  const decrypted = CryptoJS.AES.decrypt(encryptedText, key);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

export function generateAESKey(): string {
  return CryptoJS.lib.WordArray.random(256 / 8).toString();
}

export function generateAESKeyHex(): string {
  return CryptoJS.lib.WordArray.random(256 / 8).toString(CryptoJS.enc.Hex);
}

export function textToNumber(text: string): bigint {
  if (!text || text.trim() === "") {
    throw new Error("Text cannot be empty");
  }
  
  const hash = CryptoJS.SHA256(text);
  const hashHex = hash.toString(CryptoJS.enc.Hex);
  const truncatedHash = hashHex.slice(0, 16);
  return BigInt("0x" + truncatedHash);
}

export function numberToText(number: bigint): string {
  const bytes: number[] = [];
  let n = number;
  while (n > 0) {
    bytes.unshift(Number(n % BigInt(256)));
    n = n / BigInt(256);
  }
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(bytes));
}

// Binary utilities
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("Invalid hex length");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateIv(length = 12): Uint8Array {
  if (typeof window === "undefined" || !window.crypto?.getRandomValues) {
    throw new Error("Browser environment is not available, cannot generate IV");
  }
  const iv = new Uint8Array(length);
  window.crypto.getRandomValues(iv);
  return iv;
}

async function importAesKeyFromHex(hexKey: string): Promise<CryptoKey> {
  const rawU8 = hexToBytes(hexKey);
  const raw = rawU8.buffer.slice(rawU8.byteOffset, rawU8.byteOffset + rawU8.byteLength) as ArrayBuffer;
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBytesAESGCM(
  plainBytes: ArrayBuffer | Uint8Array,
  hexKey: string,
  iv: Uint8Array
): Promise<Uint8Array> {
  const key = await importAesKeyFromHex(hexKey);
  const dataU8 = plainBytes instanceof Uint8Array ? plainBytes : new Uint8Array(plainBytes);
  const data = dataU8.buffer.slice(dataU8.byteOffset, dataU8.byteOffset + dataU8.byteLength) as ArrayBuffer;
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(ivBuf) }, key, data);
  return new Uint8Array(cipherBuf);
}

export async function decryptBytesAESGCM(
  cipherBytes: ArrayBuffer | Uint8Array,
  hexKey: string,
  iv: Uint8Array
): Promise<Uint8Array> {
  const key = await importAesKeyFromHex(hexKey);
  const dataU8 = cipherBytes instanceof Uint8Array ? cipherBytes : new Uint8Array(cipherBytes);
  const data = dataU8.buffer.slice(dataU8.byteOffset, dataU8.byteOffset + dataU8.byteLength) as ArrayBuffer;
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(ivBuf) }, key, data);
  return new Uint8Array(plainBuf);
}
