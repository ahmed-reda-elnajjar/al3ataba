/* Main admins only: list / add / remove team members with limited access. */
import { isAdminToken } from "@/lib/serverAuth";
import { listSA, setDocSA } from "@/lib/sa";
import { STAFF_ROLES, staffDocId, staffKey, type Staff } from "@/lib/staff";

export const dynamic = "force-dynamic";
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return bad("unauthorized", 401);
  try {
    const list = (await listSA<Staff & { removed?: boolean }>("staff", 500)).filter((s) => s.role && !s.removed);
    return Response.json({ staff: list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)), roles: STAFF_ROLES }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return bad(String((e as Error).message || e), 500); }
}

export async function POST(req: Request) {
  const token = req.headers.get("x-firebase-token") || "";
  if (!(await isAdminToken(token))) return bad("unauthorized", 401);
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === "remove") {
      const key = staffKey(b.key);
      if (!key) return bad("بيانات غلط");
      await setDocSA(`staff/${staffDocId(key)}`, { key, role: null, removed: true, removedAt: Date.now() });
      return Response.json({ ok: true });
    }
    const key = staffKey(b.identifier);
    if (!key) return bad("اكتب إيميل صحيح أو رقم موبايل مصري (01xxxxxxxxx)");
    const role = b.role in STAFF_ROLES ? b.role : "resell";
    const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (name.length < 2) return bad("اكتب اسم الموظف");
    await setDocSA(`staff/${staffDocId(key)}`, { key, name, role, addedAt: Date.now() });
    return Response.json({ ok: true, key });
  } catch (e) { return bad(String((e as Error).message || e), 500); }
}
