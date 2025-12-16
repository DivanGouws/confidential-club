import { decryptText } from "./encryption";
import { fetchPostContent } from "./pinata";
import { getPinataUrl } from "./pinata";
import type { RelayerInstance } from "./relayer-sdk";
import type { WalletClient } from "viem";

export interface PostData {
  postId: number;
  price: bigint;
  exists: boolean;
  purchased: boolean;
}

export interface DecryptedPost {
  postId: number;
  price: bigint;
  content: string;
}

export async function fetchPostFromIPFS(postId: number): Promise<string | null> {
  return await fetchPostContent(postId);
}

export async function decryptAESKey(
  ciphertextHandle: string,
  relayerInstance: RelayerInstance,
  contractAddress: string,
  walletClient: WalletClient,
  userAddress: string
): Promise<string> {
  if (!ciphertextHandle || ciphertextHandle.length === 0) {
    throw new Error("Ciphertext handle is empty");
  }

  if (!contractAddress || contractAddress.length === 0) {
    throw new Error("Contract address is empty");
  }

  if (!walletClient) {
    throw new Error("Wallet client is not ready");
  }

  if (!userAddress) {
    throw new Error("User address is empty");
  }

  let handleString = ciphertextHandle;
  if (!handleString.startsWith("0x")) {
    handleString = `0x${handleString}`;
  }

  if (handleString.length !== 66) {
    throw new Error(`Invalid ciphertext handle format. Expected length 66, got ${handleString.length}`);
  }

  try {
    // Use the standard EIP-712 signature flow (SDK 0.3.0-6)
    const t0 = performance.now();
    const keypair = relayerInstance.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "1";

    const eip712 = relayerInstance.createEIP712(
      keypair.publicKey,
      [contractAddress],
      startTimeStamp,
      durationDays
    );
    if (process.env.NODE_ENV === "development") {
      console.log(`[decryptAESKey] createEIP712: ${(performance.now() - t0).toFixed(0)}ms`);
    }

    if (!walletClient.account) {
      throw new Error("Wallet account is not ready");
    }

    const t1 = performance.now();
    const signature = await walletClient.signTypedData({
      account: walletClient.account,
      domain: eip712.domain as Record<string, unknown>,
      types: eip712.types as Record<string, unknown>,
      primaryType: "UserDecryptRequestVerification",
      message: eip712.message as Record<string, unknown>,
    });
    if (process.env.NODE_ENV === "development") {
      console.log(`[decryptAESKey] signTypedData: ${(performance.now() - t1).toFixed(0)}ms`);
    }

    const handleContractPairs = [{ handle: handleString, contractAddress }];
    const userDecryptLegacy = relayerInstance.userDecrypt as unknown as (
      handleContractPairs: Array<{ handle: unknown; contractAddress: string }>,
      privateKey: string,
      publicKey: string,
      signature: string,
      contractAddresses: string[],
      userAddress: string,
      startTimeStamp: string,
      durationDays: string
    ) => Promise<Record<string, bigint | string>>;

    const t2 = performance.now();
    const result = await userDecryptLegacy(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace("0x", ""),
      [contractAddress],
      userAddress,
      startTimeStamp,
      durationDays
    );
    if (process.env.NODE_ENV === "development") {
      console.log(`[decryptAESKey] userDecrypt: ${(performance.now() - t2).toFixed(0)}ms`);
    }

    const aesKeyBigInt = result[handleString];
    if (aesKeyBigInt === null || aesKeyBigInt === undefined) {
      throw new Error("Decryption result is empty");
    }

    const aesKeyHex = typeof aesKeyBigInt === "bigint"
      ? aesKeyBigInt.toString(16).padStart(64, "0")
      : BigInt(aesKeyBigInt).toString(16).padStart(64, "0");

    if (!aesKeyHex || aesKeyHex.length === 0) {
      throw new Error("Failed to convert AES key");
    }

    return aesKeyHex;
  } catch (error) {
    throw error;
  }
}

export function decryptEncryptedContent(encryptedContent: string, aesKeyHex: string): string {
  if (!encryptedContent || encryptedContent.length === 0) {
    throw new Error("Encrypted content is empty");
  }

  if (!aesKeyHex || aesKeyHex.length === 0) {
    throw new Error("AES key is empty");
  }

  const decryptedContent = decryptText(encryptedContent, aesKeyHex);
  
  if (!decryptedContent || decryptedContent.length === 0) {
    throw new Error("Decrypted content is empty; the key may be incorrect");
  }

  return decryptedContent;
}

export async function decryptPost(
  encryptedContent: string,
  ciphertextHandle: string,
  relayerInstance: RelayerInstance,
  contractAddress: string,
  walletClient: WalletClient,
  userAddress: string
): Promise<string> {
  const aesKeyHex = await decryptAESKey(
    ciphertextHandle,
    relayerInstance,
    contractAddress,
    walletClient,
    userAddress
  );

  return decryptEncryptedContent(encryptedContent, aesKeyHex);
}

export async function getPostContentUrl(postId: number): Promise<string | null> {
  const ipfsHash = await fetchPostContent(postId);
  if (!ipfsHash) {
    return null;
  }
  return getPinataUrl(ipfsHash);
}


