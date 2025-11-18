import { useState } from "react";
import { createPostMetadata } from "@/lib/pinata";

export interface UsePinataResult {
  uploadFile: (file: File, metadata?: { name?: string; folder?: string; keyvalues?: Record<string, string> }) => Promise<string>;
  uploadJson: (json: Record<string, unknown>, metadata?: { name?: string; folder?: string; keyvalues?: Record<string, string> }) => Promise<string>;
  uploadPostContent: (file: File, postId: string | number, walletAddress: string, options?: { name?: string; timestamp?: number; additionalKeyvalues?: Record<string, string> }) => Promise<string>;
  uploadPostMetadata: (json: Record<string, unknown>, postId: string | number, walletAddress: string, options?: { name?: string; timestamp?: number; additionalKeyvalues?: Record<string, string> }) => Promise<string>;
  uploadDirectory: (
    files: Array<{ path: string; blob: Blob }>,
    metadata?: { name?: string; folder?: string; keyvalues?: Record<string, string> }
  ) => Promise<string>;
  loading: boolean;
  error: Error | null;
}

export function usePinata(): UsePinataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = async (
    file: File,
    metadata?: { name?: string; folder?: string; keyvalues?: Record<string, string> }
  ): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      if (metadata) {
        const fileName = metadata.name || file.name;
        const fullName = metadata.folder ? `${metadata.folder}/${fileName}` : fileName;
        
        formData.append(
          "metadata",
          JSON.stringify({
            name: fullName,
            folder: metadata.folder,
            keyvalues: {
              ...(metadata.keyvalues || {}),
            },
          })
        );
      }

      let response: Response;
      try {
        const apiUrl = typeof window !== "undefined" 
          ? `${window.location.origin}/api/pinata/upload`
          : "/api/pinata/upload";
        
        console.log(`[Pinata] Uploading file to: ${apiUrl}`);
        response = await fetch(apiUrl, {
          method: "POST",
          body: formData,
        });
      } catch (fetchError) {
        console.error("[Pinata] Fetch request failed:", fetchError);
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        throw new Error(`Unable to connect to the server: ${errorMsg}. Please make sure the development server is running.`);
      }

      if (!response.ok) {
        let errorMessage = "Upload failed";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.IpfsHash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      const fullError = err instanceof Error && err.cause ? `${errorMessage}: ${err.cause}` : errorMessage;
      const error = new Error(fullError);
      if (err instanceof Error) {
        error.stack = err.stack;
      }
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const uploadJson = async (
    json: Record<string, unknown>,
    metadata?: { name?: string; folder?: string; keyvalues?: Record<string, string> }
  ): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      const apiUrl = typeof window !== "undefined" 
        ? `${window.location.origin}/api/pinata/upload-json`
        : "/api/pinata/upload-json";
        
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ json, metadata }),
      });

      if (!response.ok) {
        let errorMessage = "Upload failed";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.IpfsHash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      const fullError = err instanceof Error && err.cause ? `${errorMessage}: ${err.cause}` : errorMessage;
      const error = new Error(fullError);
      if (err instanceof Error) {
        error.stack = err.stack;
      }
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const uploadDirectory = async (
    files: Array<{ path: string; blob: Blob }>,
    metadata?: { name?: string; folder?: string; keyvalues?: Record<string, string> }
  ): Promise<string> => {
    setLoading(true);
    setError(null);

    // Retry helper
    const attemptUpload = async (attemptNumber: number): Promise<string> => {
      try {
        if (!files || files.length === 0) {
          throw new Error("No files to upload");
        }

        const form = new FormData();
        // Normalize to a single root directory to avoid multiple top-level entries causing Pinata 400 errors
        const ROOT_DIR = "post";
        files.forEach(({ path, blob }) => {
          const normalized = path.startsWith("/") ? path.slice(1) : path;
          const withRoot = `${ROOT_DIR}/${normalized}`;
          const file = new File([blob], withRoot, { type: (blob as File).type || "application/octet-stream" });
          form.append("file", file);
        });

        if (metadata) {
          form.append("metadata", JSON.stringify({
            name: metadata.name,
            folder: metadata.folder,
            keyvalues: metadata.keyvalues || {},
          }));
        }

        const apiUrl = typeof window !== "undefined"
          ? `${window.location.origin}/api/pinata/upload-batch`
          : "/api/pinata/upload-batch";

        console.log(`[Pinata] Uploading directory to: ${apiUrl}${attemptNumber > 1 ? ` (attempt ${attemptNumber})` : ''}`);
        const resp = await fetch(apiUrl, { method: "POST", body: form });
        if (!resp.ok) {
          let errorMessage = "Upload failed";
          try {
            const err = await resp.json();
            errorMessage = err.error || errorMessage;
            // Only log errors on the final attempt
            if (attemptNumber > 1) {
              console.error(`[Pinata] API error response:`, err);
            }
          } catch {
            errorMessage = `${resp.status} ${resp.statusText}`;
            if (attemptNumber > 1) {
              console.error(`[Pinata] HTTP error: ${errorMessage}`);
            }
          }
          throw new Error(errorMessage);
        }

        const data = await resp.json();
        return data.IpfsHash;
      } catch (err) {
        // If this is the first attempt and we see 'fetch failed', retry silently
        if (attemptNumber === 1 && err instanceof Error && err.message === "fetch failed") {
          // Do not log the error, just retry
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retrying
          return attemptUpload(2);
        }
        
        // Only log when all attempts have failed
        console.error(`[Pinata] Final upload attempt failed:`, err);
        throw err;
      }
    };

    try {
      return await attemptUpload(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      const error = new Error(message);
      if (err instanceof Error) error.stack = err.stack;
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const uploadPostContent = async (
    file: File,
    postId: string | number,
    walletAddress: string,
    options?: { name?: string; timestamp?: number; additionalKeyvalues?: Record<string, string> }
  ): Promise<string> => {
    const metadata = createPostMetadata(postId, walletAddress, {
      ...options,
      fileType: "content",
    });
    return uploadFile(file, metadata);
  };

  const uploadPostMetadata = async (
    json: Record<string, unknown>,
    postId: string | number,
    walletAddress: string,
    options?: { name?: string; timestamp?: number; additionalKeyvalues?: Record<string, string> }
  ): Promise<string> => {
    const metadata = createPostMetadata(postId, walletAddress, {
      ...options,
      fileType: "metadata",
    });
    return uploadJson(json, metadata);
  };

  return {
    uploadFile,
    uploadJson,
    uploadPostContent,
    uploadPostMetadata,
    uploadDirectory,
    loading,
    error,
  };
}

