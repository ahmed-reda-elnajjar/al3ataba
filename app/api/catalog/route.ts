/* GET  → the cached public catalogue (one Firebase read-batch every few hours instead of one per visitor).
 * POST → admin asks to refresh it after editing products/categories/offers (throttled so it can't eat the free read limit). */
import { revalidateTag } from "next/cache";
import { CATALOG_TAG, getCatalog } from "@/lib/catalog";
import { isAdminToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const c = await getCatalog();
    // the CDN keeps it 5 minutes too, so most visits don't even reach the function
    return Response.json(c, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message || e) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

const AUTO_GAP = 10 * 60_000; // automatic refresh after edits: at most every 10 minutes
const FORCE_GAP = 2 * 60_000; // "refresh now" button: at most every 2 minutes

export async function POST(req: Request) {
  const cron = process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  let at = 0;
  try { at = (await getCatalog()).at; } catch { /* no snapshot yet → refresh */ }
  const wait = (force ? FORCE_GAP : AUTO_GAP) - (Date.now() - at);
  if (!cron && at && wait > 0) return Response.json({ ok: false, wait: Math.ceil(wait / 1000) });
  revalidateTag(CATALOG_TAG);
  return Response.json({ ok: true });
}
