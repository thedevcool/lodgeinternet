import { v2 as cloudinary } from "cloudinary";

let configured = false;

function configure() {
  if (configured) return;

  const cloud_name = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Missing Cloudinary credentials. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, NEXT_PUBLIC_CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local.",
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export function getCloudinary() {
  configure();
  return cloudinary;
}

/**
 * Extract Cloudinary public_ids from any Cloudinary delivery URLs found in a
 * block of HTML. Returns an empty array if none are present.
 *
 * Handles standard URL shapes such as:
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/lodge-foo.jpg
 *   https://res.cloudinary.com/<cloud>/image/upload/c_fill,w_400/v123/lodge-foo.png
 *   https://res.cloudinary.com/<cloud>/image/upload/folder/lodge-foo.webp
 */
export function extractCloudinaryPublicIds(html: string): string[] {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !html) return [];

  const escapedCloud = cloudName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Capture everything after /image/upload/ up to the closing quote / whitespace,
  // then we strip transformations, version, and extension ourselves.
  const re = new RegExp(
    `https?://res\\.cloudinary\\.com/${escapedCloud}/image/upload/([^"'\\s<>)]+)`,
    "g",
  );

  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const path = match[1];
    // Split path segments. Cloudinary structure: [transformations/]*[v<digits>/]<public_id>.<ext>
    const segments = path.split("/");
    // Drop leading transformation segments (contain a comma or look like t_/w_/h_/c_/etc.)
    // and a single optional version segment (v + digits).
    let i = 0;
    while (
      i < segments.length - 1 &&
      (segments[i].includes(",") || /^[a-z]_/.test(segments[i]))
    ) {
      i++;
    }
    if (i < segments.length - 1 && /^v\d+$/.test(segments[i])) i++;

    const rest = segments.slice(i).join("/");
    // Strip extension (last dot-segment)
    const lastDot = rest.lastIndexOf(".");
    const publicId = lastDot > 0 ? rest.slice(0, lastDot) : rest;
    if (publicId) ids.add(publicId);
  }

  return Array.from(ids);
}

/**
 * Best-effort deletion of multiple Cloudinary assets. Logs but never throws —
 * email delivery already succeeded by the time this is called.
 */
export async function deleteCloudinaryAssets(publicIds: string[]) {
  if (publicIds.length === 0) return { deleted: 0, failed: 0 };

  const cld = getCloudinary();
  let deleted = 0;
  let failed = 0;

  await Promise.all(
    publicIds.map(async (id) => {
      try {
        const res = await cld.uploader.destroy(id, { invalidate: true });
        if (res.result === "ok" || res.result === "not found") deleted++;
        else failed++;
      } catch (err) {
        failed++;
        console.warn(`[cloudinary] failed to delete ${id}:`, err);
      }
    }),
  );

  console.log(`[cloudinary] cleanup — deleted ${deleted}, failed ${failed}`);
  return { deleted, failed };
}
