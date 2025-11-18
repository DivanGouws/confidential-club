const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";
const PINATA_GATEWAY_URL = process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || "";

export interface PinataUploadResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export interface PinataMetadata {
  name?: string;
  folder?: string;
  keyvalues?: Record<string, string>;
}

export async function uploadToPinata(
  file: File | Blob,
  metadata?: PinataMetadata
): Promise<PinataUploadResponse> {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured");
  }

  const formData = new FormData();
  formData.append("file", file);

  if (metadata) {
    const fileName = metadata.name || (file instanceof File ? file.name : "file");
    const fullName = metadata.folder ? `${metadata.folder}/${fileName}` : fileName;
    
    formData.append(
      "pinataMetadata",
      JSON.stringify({
        name: fullName,
        keyvalues: {
          ...(metadata.keyvalues || {}),
          ...(metadata.folder ? { folder: metadata.folder } : {}),
        },
      })
    );
  }

  const options = {
    pinataOptions: {
      cidVersion: 1,
    },
  };
  formData.append("pinataOptions", JSON.stringify(options.pinataOptions));

  const doUpload = async () => {
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Pinata upload failed: ${res.status} ${errorText}`);
    }

    return res;
  };

  let response: Response;
  try {
    response = await doUpload();
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("fetch failed")) {
      console.error("[Pinata] Initial file upload failed, retrying once:", err);
      response = await doUpload();
    } else {
      throw err;
    }
  }

  const data = await response.json();
  return data;
}

export async function uploadJsonToPinata(
  json: Record<string, unknown>,
  metadata?: PinataMetadata
): Promise<PinataUploadResponse> {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured");
  }

  const fileName = metadata?.name || "json-data";
  const fullName = metadata?.folder ? `${metadata.folder}/${fileName}` : fileName;

  const body = {
    pinataContent: json,
    pinataMetadata: {
      name: fullName,
      keyvalues: {
        ...(metadata?.keyvalues || {}),
        ...(metadata?.folder ? { folder: metadata.folder } : {}),
      },
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const doUpload = async () => {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Pinata upload failed: ${res.status} ${errorText}`);
    }

    return res;
  };

  let response: Response;
  try {
    response = await doUpload();
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("fetch failed")) {
      console.error("[Pinata] Initial JSON upload failed, retrying once:", err);
      response = await doUpload();
    } else {
      throw err;
    }
  }

  const data = await response.json();
  return data;
}

export function getPinataUrl(ipfsHash: string): string {
  if (PINATA_GATEWAY_URL) {
    return `https://${PINATA_GATEWAY_URL}/ipfs/${ipfsHash}`;
  }
  return `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
}

export async function fetchFromPinata(ipfsHash: string): Promise<string> {
  const url = getPinataUrl(ipfsHash);
  console.log(`[Pinata] Fetching content from IPFS gateway: ${url}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch content from IPFS: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Fetching content from IPFS timed out (30 seconds)');
    }
    throw error;
  }
}

export async function fetchPostContent(postId: string | number): Promise<string | null> {
  const ipfsHash = await queryPostContent(postId);
  if (!ipfsHash) {
    console.log(`[Pinata] Post ${postId} did not have an IPFS hash`);
    return null;
  }
  console.log(`[Pinata] Post ${postId} IPFS hash found: ${ipfsHash}`);
  try {
    const content = await fetchFromPinata(ipfsHash);
    console.log(`[Pinata] Post ${postId} content fetched from IPFS successfully, length: ${content.length}`);
    return content;
  } catch (error) {
    console.error(`[Pinata] Post ${postId} failed to fetch content from IPFS:`, error);
    return null;
  }
}

export interface PinataQueryResponse {
  count: number;
  rows: Array<{
    id: string;
    ipfs_pin_hash: string;
    size: number;
    user_id: string;
    date_pinned: string;
    date_unpinned: string | null;
    metadata: {
      name: string;
      keyvalues: Record<string, string>;
    };
    mime_type: string;
  }>;
}

export async function queryPinataFiles(filters: {
  walletAddress?: string;
  postId?: string | number;
  fileType?: "content" | "metadata";
}): Promise<PinataQueryResponse> {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured");
  }

  const keyvalues: Record<string, string> = {};
  
  if (filters.walletAddress) {
    keyvalues.walletAddress = filters.walletAddress.toLowerCase();
  }
  
  if (filters.postId !== undefined) {
    keyvalues.postId = String(filters.postId);
  }
  
  if (filters.fileType) {
    keyvalues.fileType = filters.fileType;
  }

  const query = new URLSearchParams();
  query.append("metadata", JSON.stringify({ keyvalues }));
  query.append("status", "pinned");

  const response = await fetch(
    `https://api.pinata.cloud/data/pinList?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata query failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data;
}

export async function queryPostsByWallet(walletAddress: string): Promise<PinataQueryResponse> {
  return queryPinataFiles({ walletAddress });
}

export async function queryPostFiles(postId: string | number): Promise<PinataQueryResponse> {
  return queryPinataFiles({ postId });
}

export async function queryPostContent(postId: string | number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const apiUrl = typeof window !== "undefined" 
      ? `${window.location.origin}/api/pinata/query`
      : "/api/pinata/query";
      
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, fileType: "content" }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Pinata] Failed to query post content (postId: ${postId}):`, response.status, errorText);
      return null;
    }

    const data = await response.json();
    return data.ipfsHash || null;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Pinata] Querying post content timed out (postId: ${postId})`);
    } else {
      console.error(`[Pinata] Unexpected error while querying post content (postId: ${postId}):`, error);
    }
    return null;
  }
}

export async function queryPostMetadata(postId: string | number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const apiUrl = typeof window !== "undefined" 
      ? `${window.location.origin}/api/pinata/query`
      : "/api/pinata/query";
      
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, fileType: "metadata" }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Pinata] Failed to query post metadata (postId: ${postId}):`, response.status, errorText);
      return null;
    }

    const data = await response.json();
    return data.ipfsHash || null;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Pinata] Querying post metadata timed out (postId: ${postId})`);
    } else {
      console.error(`[Pinata] Unexpected error while querying post metadata (postId: ${postId}):`, error);
    }
    return null;
  }
}

export async function fetchPostMetadata(postId: string | number): Promise<Record<string, unknown> | null> {
  const ipfsHash = await queryPostMetadata(postId);
  if (!ipfsHash) {
    return null;
  }
  const url = getPinataUrl(ipfsHash);
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data.pinataContent || data;
}

export function getPostFolderPath(postId: string | number): string {
  if (postId === undefined || postId === null) {
    throw new Error("Post ID cannot be empty");
  }
  return `ConfidentialClub/posts/${postId}`;
}

export function createPostMetadata(
  postId: string | number,
  walletAddress: string,
  options?: {
    name?: string;
    fileType?: "content" | "metadata";
    timestamp?: number;
    additionalKeyvalues?: Record<string, string>;
  }
): PinataMetadata {
  if (!postId) {
    throw new Error("Post ID cannot be empty");
  }
  
  const folder = getPostFolderPath(postId);
  const fileType = options?.fileType || "content";
  const defaultName = fileType === "metadata" 
    ? `metadata.json` 
    : `content.encrypted`;
  const fileName = options?.name || defaultName;
  
  return {
    folder,
    name: fileName,
    keyvalues: {
      postId: String(postId),
      walletAddress: walletAddress.toLowerCase(),
      fileType,
      ...(options?.timestamp ? { timestamp: String(options.timestamp) } : {}),
      ...(options?.additionalKeyvalues || {}),
    },
  };
}

