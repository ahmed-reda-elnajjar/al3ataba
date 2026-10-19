/* Server-only: Firestore with the service account (bypasses the security rules — validate everything before writing).
 * Needs FIREBASE_SERVICE_ACCOUNT (the JSON) in Vercel. */
import { createSign } from "crypto";
import { fromDoc, type V } from "./fsrest";

type SA = { project_id: string; client_email: string; private_key: string };
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
let tok: { at: number; t: string } | null = null;

function sa(): SA {
  const s = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}") as SA;
  if (!s.private_key) throw Object.assign(new Error("FIREBASE_SERVICE_ACCOUNT مش متضاف في Vercel"), { status: 500 });
  return s;
}
async function token() {
  if (tok && Date.now() - tok.at < 45 * 60_000) return tok.t;
  const s = sa(), now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: s.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 }));
  const sig = b64u(createSign("RSA-SHA256").update(`${head}.${body}`).sign(s.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("service account login failed");
  tok = { at: Date.now(), t: j.access_token };
  return tok.t;
}
const root = () => `https://firestore.googleapis.com/v1/projects/${sa().project_id}/databases/(default)/documents`;

async function call(path: string, init?: RequestInit) {
  const r = await fetch(`${root()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(j?.error?.message || `Firestore ${r.status}`), { status: r.status === 429 ? 503 : 500 });
  return r.status === 404 ? null : j;
}

/** JS value → Firestore REST value. */
export function enc(v: unknown): V | { mapValue: { fields: Record<string, unknown> } } {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) as V[] } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) } };
}
const fields = (o: object) => (enc(o) as { mapValue: { fields: Record<string, unknown> } }).mapValue.fields;

export async function getDocSA<T>(path: string): Promise<T | null> {
  const d = await call(`/${path}`);
  return d ? (fromDoc<T>(d) as T) : null;
}
export async function queryEq<T>(collection: string, field: string, value: string, max = 1000): Promise<T[]> {
  const rows: { document?: { name: string; fields?: Record<string, V> } }[] = await call(`:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } }, limit: max } }) });
  return (rows || []).filter((x) => x.document).map((x) => fromDoc<T>(x.document!) as T);
}
export async function listSA<T>(collection: string, max = 300): Promise<T[]> {
  const d = await call(`/${collection}?pageSize=${max}`);
  return ((d?.documents || []) as { name: string; fields?: Record<string, V> }[]).map((x) => fromDoc<T>(x) as T);
}
/** Create a document with an auto id; returns the id. */
export async function addDocSA(collection: string, data: object): Promise<string> {
  const d = await call(`/${collection}`, { method: "POST", body: JSON.stringify({ fields: fields(data) }) });
  return String(d.name).split("/").pop()!;
}
