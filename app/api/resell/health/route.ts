/* Quick check that the server side of "البيع بالعمولة" is configured (returns no secrets). */
import { hasSA } from "@/lib/sa";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ ok: hasSA(), serviceAccount: hasSA() }, { headers: { "Cache-Control": "no-store" } });
}
