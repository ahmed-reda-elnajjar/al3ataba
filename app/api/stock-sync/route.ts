/* Daily stock sync with partner stores (runs from Vercel Cron, or "شغّل دلوقتي" in the admin).
 *  - product sold out at the partner → hidden on our site (outOfStock: true)
 *  - product back in stock and it was hidden by this sync → published again
 * Auth: Vercel's CRON_SECRET header, or a signed-in admin's Firebase ID token.
 * Needs env FIREBASE_SERVICE_ACCOUNT (the service-account JSON) set in Vercel — never in the code. */
import { createSign } from "crypto";
import { availability, fetchCatalogue } from "@/lib/stock";
import { isAdminToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SA = { project_id: string; client_email: string; private_key: string };
type FsVal = { stringValue?: string; booleanValue?: boolean; integerValue?: string; arrayValue?: { values?: FsVal[] }; mapValue?: { fields?: Record<string, FsVal> } };

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function googleToken(sa: SA) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 }));
  const sig = b64u(createSign("RSA-SHA256").update(`${head}.${body}`).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("service account login failed");
  return j.access_token as string;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const idToken = req.headers.get("x-firebase-token") || "";
  if (!cronOk && !(idToken && (await isAdminToken(idToken)))) return Response.json({ error: "unauthorized" }, { status: 401 });

  let sa: SA;
  try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ""); if (!sa.private_key) throw 0; }
  catch { return Response.json({ error: "FIREBASE_SERVICE_ACCOUNT مش متضاف في Vercel" }, { status: 500 }); }

  const started = Date.now();
  const deadline = started + 40_000; // keep time for the writes
  const token = await googleToken(sa);
  const root = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const fs = (path: string, init?: RequestInit) => fetch(`${root}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) } }).then((r) => r.json());
  const log = async (data: Record<string, unknown>) => {
    const fields: Record<string, FsVal> = {};
    for (const [k, v] of Object.entries(data)) fields[k] = typeof v === "number" ? { integerValue: String(v) } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) };
    await fs(`/sync/stock`, { method: "PATCH", body: JSON.stringify({ fields }) });
  };

  try {
    // partner stores = the saved import links (default: alwazeers)
    const site = await fs(`/settings/site`);
    const saved = (site?.fields?.importSources?.arrayValue?.values ?? []).map((v: FsVal) => v.mapValue?.fields?.url?.stringValue).filter(Boolean) as string[];
    const bases = Array.from(new Set((saved.length ? saved : ["https://alwazeers.com"]).map((u) => u.replace(/\/+$/, "").split("?")[0])));

    // our imported products
    const rows: { document?: { name: string; fields?: Record<string, FsVal> } }[] = await fs(`:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "products" }],
      where: { fieldFilter: { field: { fieldPath: "source" }, op: "EQUAL", value: { stringValue: "6valley" } } },
      select: { fields: [{ fieldPath: "sourceId" }, { fieldPath: "status" }, { fieldPath: "outOfStock" }] },
    } }) });
    const ours = rows.filter((r) => r.document).map((r) => ({ name: r.document!.name, sid: r.document!.fields?.sourceId?.stringValue || "", status: r.document!.fields?.status?.stringValue || "", oos: !!r.document!.fields?.outOfStock?.booleanValue }));

    const writes: unknown[] = [];
    let checked = 0, hidden = 0, restored = 0, gone = 0;
    const notes: string[] = [];
    for (const base of bases) {
      const host = new URL(base).host;
      const mine = ours.filter((o) => o.sid.startsWith(`${host}:`));
      if (!mine.length) continue;
      let cat;
      try { cat = await fetchCatalogue(base, deadline); } catch (e) { notes.push(`${host}: ${String((e as Error)?.message || e)}`); continue; }
      // note: "published" is 0 for every product on alwazeers, so it is NOT used; status 0 = disabled
      const outMap = new Map(cat.products.map((p) => [`${host}:${p.id}`, availability(p).out]));
      const trustMissing = cat.complete && cat.total > 0 && cat.products.length >= cat.total * 0.9;
      for (const o of mine) {
        checked++;
        const known = outMap.has(o.sid);
        if (!known && trustMissing) gone++;
        const out: boolean | null = known ? outMap.get(o.sid)! : trustMissing ? true : null;
        const upd = (status: string, oos: boolean) => writes.push({ update: { name: o.name, fields: { status: { stringValue: status }, outOfStock: { booleanValue: oos }, stockCheckedAt: { stringValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ["status", "outOfStock", "stockCheckedAt"] } });
        if (out === true && o.status === "active") { upd("hidden", true); hidden++; }
        else if (out === false && o.oos && o.status === "hidden") { upd("active", false); restored++; }
      }
      if (!cat.complete) notes.push(`${host}: الوقت خلص قبل ما يقرا كل الأقسام`);
    }
    for (let i = 0; i < writes.length; i += 400) await fs(`:commit`, { method: "POST", body: JSON.stringify({ writes: writes.slice(i, i + 400) }) });

    const result = { at: new Date().toISOString(), checked, hidden, restored, gone, seconds: Math.round((Date.now() - started) / 1000), note: notes.join(" | "), by: cronOk ? "cron" : "admin" };
    await log(result);
    return Response.json(result);
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await log({ at: new Date().toISOString(), error: msg }).catch(() => {});
    return Response.json({ error: msg }, { status: 500 });
  }
}
