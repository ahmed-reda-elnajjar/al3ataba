/* Server-only: Cloudflare R2 (S3-compatible) — our own image/video storage. No SDK, just signed requests.
 * Needs in Vercel → Environment Variables (never in the code):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL (e.g. https://pub-xxxx.r2.dev)
 * Files are served straight from R2's public URL: no per-view processing, so no monthly "credits" to run out. */
import { createHash, createHmac } from "crypto";

type Cfg = { acc: string; key: string; secret: string; bucket: string; pub: string };
export function r2(): Cfg | null {
  const e = process.env;
  if (!e.R2_ACCOUNT_ID || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_BUCKET || !e.R2_PUBLIC_URL) return null;
  return { acc: e.R2_ACCOUNT_ID.trim(), key: e.R2_ACCESS_KEY_ID.trim(), secret: e.R2_SECRET_ACCESS_KEY.trim(), bucket: e.R2_BUCKET.trim(), pub: e.R2_PUBLIC_URL.trim().replace(/\/+$/, "") };
}
export const hasR2 = () => !!r2();

const sha = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = (k: string) => k.split("/").map(enc).join("/");

function signingKey(secret: string, date: string) {
  return hmac(hmac(hmac(hmac("AWS4" + secret, date), "auto"), "s3"), "aws4_request");
}
function stamp() {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261104T120000Z
  return { amz: iso, date: iso.slice(0, 8) };
}

/** Upload bytes. Returns the public URL. */
export async function r2Put(key: string, body: Buffer, type: string): Promise<string> {
  const c = r2(); if (!c) throw new Error("R2 مش متضاف في Vercel");
  const host = `${c.acc}.r2.cloudflarestorage.com`;
  const path = `/${c.bucket}/${encKey(key)}`;
  const { amz, date } = stamp();
  const hash = sha(body);
  const headers: Record<string, string> = { host, "x-amz-content-sha256": hash, "x-amz-date": amz, "content-type": type, "cache-control": "public, max-age=31536000, immutable" };
  const names = Object.keys(headers).sort();
  const canon = ["PUT", path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), hash].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const sig = createHmac("sha256", signingKey(c.secret, date)).update(["AWS4-HMAC-SHA256", amz, scope, sha(canon)].join("\n")).digest("hex");
  const r = await fetch(`https://${host}${path}`, {
    method: "PUT", body: new Uint8Array(body), cache: "no-store",
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` },
  });
  if (!r.ok) throw new Error(`R2 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${c.pub}/${encKey(key)}`;
}

/** A URL the browser can PUT a big file (video) to directly, valid for `secs`. */
export function r2PresignPut(key: string, secs = 900): { put: string; url: string } {
  const c = r2(); if (!c) throw new Error("R2 مش متضاف في Vercel");
  const host = `${c.acc}.r2.cloudflarestorage.com`;
  const path = `/${c.bucket}/${encKey(key)}`;
  const { amz, date } = stamp();
  const scope = `${date}/auto/s3/aws4_request`;
  const q: Record<string, string> = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${c.key}/${scope}`, "X-Amz-Date": amz, "X-Amz-Expires": String(secs), "X-Amz-SignedHeaders": "host" };
  const qs = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join("&");
  const canon = ["PUT", path, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sig = createHmac("sha256", signingKey(c.secret, date)).update(["AWS4-HMAC-SHA256", amz, scope, sha(canon)].join("\n")).digest("hex");
  return { put: `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`, url: `${c.pub}/${encKey(key)}` };
}

export const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
