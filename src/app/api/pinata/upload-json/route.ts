import { NextRequest, NextResponse } from "next/server";

const PINATA_JWT = process.env.PINATA_JWT || "";

export async function POST(request: NextRequest) {
  if (!PINATA_JWT) {
    return NextResponse.json({ error: "PINATA_JWT is not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { json, metadata } = body;

    if (!json) {
      return NextResponse.json({ error: "No JSON payload provided" }, { status: 400 });
    }

    const fileName = metadata?.name || "json-data";
    const fullName = metadata?.folder ? `${metadata.folder}/${fileName}` : fileName;

    const pinataBody = {
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

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify(pinataBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Pinata JSON upload failed: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Pinata JSON upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

