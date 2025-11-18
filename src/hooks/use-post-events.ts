import { useRef } from "react";
import { usePublicClient } from "wagmi";

const CONFIDENTIAL_CLUB_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_CLUB_ADDRESS || "";

export interface PostEvent {
  postId: bigint;
  price: bigint;
  timestamp: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

export function usePostEvents() {
  const publicClient = usePublicClient();
  // Simple in-memory cache to avoid repeated queries
  const timestampCacheRef = useRef<Map<string, bigint>>(new Map());

  const getAllPosts = async (): Promise<PostEvent[]> => {
    if (!publicClient || !CONFIDENTIAL_CLUB_ADDRESS) {
      return [];
    }

    try {
      const latest = await publicClient.getBlockNumber();
      const step = BigInt(20000); // Query in segments to avoid too large block ranges
      const posts: PostEvent[] = [];

      for (let to = latest; to >= BigInt(0); to -= step) {
        const from = to >= step ? to - step + BigInt(1) : BigInt(0);
        const events = await publicClient.getLogs({
        address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
        event: {
          type: "event",
          name: "PostPublished",
          inputs: [
            { name: "postId", type: "uint256", indexed: true },
            { name: "price", type: "uint256", indexed: false },
          ],
        },
        fromBlock: from,
        toBlock: to,
        });

        for (const event of events) {
          const block = await publicClient.getBlock({ blockNumber: event.blockNumber });
          posts.push({
            postId: event.args.postId as bigint,
            price: event.args.price as bigint,
            timestamp: BigInt(block.timestamp),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
          });
        }
        if (from === BigInt(0)) break;
      }

      return posts.sort((a, b) => {
        if (b.timestamp > a.timestamp) return 1;
        if (b.timestamp < a.timestamp) return -1;
        return 0;
      });
    } catch {
      // Fail silently and return an empty list
      return [];
    }
  };

  const getPostTimestamp = async (
    postId: bigint,
    options?: { maxSteps?: number; stepSize?: bigint }
  ): Promise<bigint | null> => {
    if (!publicClient || !CONFIDENTIAL_CLUB_ADDRESS) {
      return null;
    }

    try {
      const cacheKey = `${CONFIDENTIAL_CLUB_ADDRESS}:${postId.toString()}`;
      if (timestampCacheRef.current.has(cacheKey)) {
        return timestampCacheRef.current.get(cacheKey) as bigint;
      }

      const latest = await publicClient.getBlockNumber();
      const step = options?.stepSize ?? BigInt(20000); // Block range step size, to respect RPC limits
      const maxSteps = options?.maxSteps ?? 50; // Cap at 50 segments to avoid very long-running queries

      let steps = 0;
      for (let to = latest; to >= BigInt(0) && steps < maxSteps; to -= step) {
        const from = to >= step ? to - step + BigInt(1) : BigInt(0);
        const events = await publicClient.getLogs({
          address: CONFIDENTIAL_CLUB_ADDRESS as `0x${string}`,
          event: {
            type: "event",
            name: "PostPublished",
            inputs: [
              { name: "postId", type: "uint256", indexed: true },
              { name: "price", type: "uint256", indexed: false },
            ],
          },
          args: { postId },
          fromBlock: from,
          toBlock: to,
        });

        if (events.length > 0) {
          const block = await publicClient.getBlock({ blockNumber: events[0].blockNumber });
          const ts = BigInt(block.timestamp);
          timestampCacheRef.current.set(cacheKey, ts);
          return ts;
        }
        steps += 1;
        if (from === BigInt(0)) break;
      }

      return null;
    } catch {
      // Fail silently and return null
      return null;
    }
  };

  return {
    getAllPosts,
    getPostTimestamp,
  };
}

