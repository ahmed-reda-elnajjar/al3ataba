/* Which team role the signed-in user has (used to show the staff pages). */
import { roleFromToken } from "@/lib/staff";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const r = await roleFromToken(req.headers.get("x-firebase-token") || "").catch(() => null);
  return Response.json({ role: r?.role || null, name: r?.name || "" }, { headers: { "Cache-Control": "no-store" } });
}
