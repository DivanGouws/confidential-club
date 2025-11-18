import { NextRequest, NextResponse } from "next/server";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";

export async function POST(request: NextRequest) {
  if (!PINATA_JWT) {
    return NextResponse.json({ error: "PINATA_JWT is not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { avatar, nickname, twitter, address } = body;

    if (!nickname || !address) {
      return NextResponse.json({ error: "Missing required parameters: nickname or address" }, { status: 400 });
    }

    const userProfile = {
      avatar: avatar || "",
      nickname: nickname.trim(),
      twitter: twitter?.trim() || "",
      updatedAt: new Date().toISOString(),
    };

    const pinataBody = {
      pinataContent: userProfile,
      pinataMetadata: {
        name: `profile-${address}.json`,
        keyvalues: {
          folder: "user-profiles",
          address: address,
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
      throw new Error(`Pinata profile upload failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json({ 
      success: true,
      ipfsHash: data.IpfsHash 
    });
  } catch (error) {
    console.error("Profile upload failed:", error);
    const errorMessage = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
