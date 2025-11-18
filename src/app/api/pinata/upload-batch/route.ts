import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || "";
  if (!PINATA_JWT) {
    return NextResponse.json({ error: "PINATA_JWT is not configured" }, { status: 500 });
  }

  try {
    const form = await request.formData();

    const pinataForm = new FormData();

    // Forward metadata as pinataMetadata
    // Note: When using wrapWithDirectory: true, do not set folder in pinataMetadata
    // because Pinata will automatically create a directory that wraps all files
    const metadataStr = form.get("metadata");
    if (metadataStr) {
      try {
        const metadata = JSON.parse(metadataStr as string);
        const fileName = metadata.name || "bundle";
        pinataForm.append(
          "pinataMetadata",
          JSON.stringify({
            name: fileName,
            keyvalues: {
              ...(metadata.keyvalues || {}),
              ...(metadata.folder ? { folder: metadata.folder } : {}),
            },
          })
        );
      } catch {
        pinataForm.append("pinataMetadata", metadataStr as string);
      }
    }

    // Pinata options
    pinataForm.append(
      "pinataOptions",
      JSON.stringify({ cidVersion: 1, wrapWithDirectory: true })
    );

    // Collect all file entries (any FormData field whose value is a File)
    let fileCount = 0;
    for (const [, value] of form.entries()) {
      if (value instanceof File) {
        const file = value as File;
        // Pinata expects a file path as the third argument; ensure the path is valid
        const filePath = file.name || "file";
        // Ensure the path does not start with "/" and uses "/" as the separator
        const normalizedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
        pinataForm.append("file", file, normalizedPath);
        fileCount += 1;
      }
    }

    if (fileCount === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    console.log(`[API/Pinata] Ready to upload ${fileCount} files to Pinata`);
    const resp = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataForm,
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[API/Pinata] Pinata returned an error: ${resp.status}`, errorText);
      return NextResponse.json(
        { error: `Pinata upload failed: ${resp.status} ${errorText}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API/Pinata] Error details:", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


