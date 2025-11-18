import { NextRequest, NextResponse } from "next/server";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";

export async function POST(request: NextRequest) {
  if (!PINATA_JWT) {
    return NextResponse.json({ error: "PINATA_JWT is not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { postId, fileType } = body;

    if (postId === undefined || !fileType) {
      return NextResponse.json({ error: "Missing required parameters: postId or fileType" }, { status: 400 });
    }

    const keyvalues: Record<string, string> = {
      postId: String(postId),
      fileType: fileType,
    };

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
      return NextResponse.json(
        { error: `Pinata query failed: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    if (data.count > 0 && data.rows.length > 0) {
      return NextResponse.json({ ipfsHash: data.rows[0].ipfs_pin_hash });
    }

    return NextResponse.json({ ipfsHash: null });
  } catch (error) {
    console.error("Pinata query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 500 }
    );
  }
}

