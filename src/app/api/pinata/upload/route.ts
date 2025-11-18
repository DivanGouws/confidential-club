import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";
  
  if (!PINATA_JWT) {
    console.error("[Pinata] Environment variable PINATA_JWT is not set");
    return NextResponse.json(
      { error: "PINATA_JWT is not configured. Please set PINATA_JWT in the server environment." },
      { status: 500 },
    );
  }

  if (PINATA_JWT.length < 50) {
    console.error("[Pinata] PINATA_JWT length looks abnormal and may be misconfigured");
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const pinataFormData = new FormData();
    pinataFormData.append("file", file);

    const metadataStr = formData.get("metadata");
    if (metadataStr) {
      try {
        const metadata = JSON.parse(metadataStr as string);
        const fileName = metadata.name || file.name;
        const fullName = metadata.folder ? `${metadata.folder}/${fileName}` : fileName;
        
        pinataFormData.append(
          "pinataMetadata",
          JSON.stringify({
            name: fullName,
            keyvalues: {
              ...(metadata.keyvalues || {}),
              ...(metadata.folder ? { folder: metadata.folder } : {}),
            },
          })
        );
      } catch {
        pinataFormData.append("pinataMetadata", metadataStr as string);
      }
    }

    const options = {
      pinataOptions: {
        cidVersion: 1,
      },
    };
    pinataFormData.append("pinataOptions", JSON.stringify(options.pinataOptions));

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Pinata upload failed: ${response.status}`;
      
      if (response.status === 401) {
        console.error("[Pinata] 401 error - JWT token may be invalid or expired");
        console.error("[Pinata] Token length:", PINATA_JWT.length);
        console.error("[Pinata] First 10 characters of token:", PINATA_JWT.substring(0, 10));
        errorMessage = "Pinata JWT token is invalid or expired. Please verify: 1) PINATA_JWT is correctly set; 2) the token has not expired.";
      } else {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason) {
            errorMessage += ` ${errorData.error.reason}`;
          }
        } catch {
          errorMessage += ` ${errorText}`;
        }
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Pinata] Upload error details:", error);
    const errorMessage = error instanceof Error ? error.message : "Upload failed";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Pinata] Error stack:", errorStack);
    return NextResponse.json(
      { error: `Upload failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

