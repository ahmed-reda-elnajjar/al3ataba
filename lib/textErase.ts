/* Server-only: wipes text that was ADDED on top of a product photo (prices, phone numbers, captions, watermarks,
 * shop names, stickers). Gemini (free vision tier) finds the boxes; each box is then filled from its own edges
 * (Coons patch), so plain and softly-shaded backgrounds come out clean. Writing that is physically printed on the
 * product or its box is left alone. Best-effort: on any failure the original picture comes back unchanged. */
import sharp from "sharp";

const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const PROMPT = `This is a product photo for an online store. Find every piece of text or number that was ADDED ON TOP of the photo afterwards: prices, phone numbers, captions, slogans, shop or page names, watermarks, logos of sellers, stickers/emoji, social media handles, borders with writing.
Do NOT include writing that is physically printed on the product itself, on its label or on its packaging box.
Return JSON only: {"boxes":[[ymin,xmin,ymax,xmax], ...]} with coordinates from 0 to 1000, each box tight around one text block. If there is none, return {"boxes":[]}.`;

type Box = [number, number, number, number];

async function findText(jpeg: Buffer): Promise<Box[]> {
  if (!process.env.GEMINI_API_KEY) return [];
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: jpeg.toString("base64") } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!r.ok) continue;
      const j = await r.json();
      const t = String(j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "").replace(/```(?:json)?/g, "");
      const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as { boxes?: unknown };
      const boxes = (Array.isArray(o.boxes) ? o.boxes : []).filter((b): b is Box => Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && n >= 0 && n <= 1000) && b[2] > b[0] && b[3] > b[1]);
      return boxes.slice(0, 25);
    } catch { /* next model */ }
  }
  return [];
}

/** Returns the picture with the added text removed (PNG), plus how many text blocks were wiped. */
export async function eraseText(input: Buffer): Promise<{ image: Buffer; erased: number }> {
  try {
    const base = sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true });
    const { data, info } = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels;
    const small = await base.clone().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const boxes = await findText(small);
    if (!boxes.length) return { image: input, erased: 0 };
    const px = (x: number, y: number, c: number) => data[(Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))) * C + c];
    let erased = 0;
    const patches: { left: number; top: number; width: number; height: number }[] = [];
    for (const [ya, xa, yb, xb] of boxes) {
      const pad = Math.round(Math.max(W, H) * 0.008) + 3;
      const x0 = Math.max(1, Math.round((xa / 1000) * W) - pad), x1 = Math.min(W - 2, Math.round((xb / 1000) * W) + pad);
      const y0 = Math.max(1, Math.round((ya / 1000) * H) - pad), y1 = Math.min(H - 2, Math.round((yb / 1000) * H) + pad);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < 4 || bh < 4 || (bw * bh) / (W * H) > 0.3) continue; // a box that big is the product, not a caption
      // edge colours just outside the box (averaged over 3 px to ignore noise)
      const edge = (x: number, y: number, dx: number, dy: number, c: number) => (px(x, y, c) + px(x + dx, y + dy, c) + px(x + 2 * dx, y + 2 * dy, c)) / 3;
      for (let y = y0; y <= y1; y++) {
        const v = (y - y0 + 0.5) / bh;
        for (let x = x0; x <= x1; x++) {
          const u = (x - x0 + 0.5) / bw;
          for (let c = 0; c < 3; c++) {
            const L = edge(x0 - 1, y, -1, 0, c), R = edge(x1 + 1, y, 1, 0, c), T = edge(x, y0 - 1, 0, -1, c), B = edge(x, y1 + 1, 0, 1, c);
            const tl = px(x0 - 1, y0 - 1, c), tr = px(x1 + 1, y0 - 1, c), bl = px(x0 - 1, y1 + 1, c), br = px(x1 + 1, y1 + 1, c);
            const val = (1 - u) * L + u * R + (1 - v) * T + v * B - ((1 - u) * (1 - v) * tl + u * (1 - v) * tr + (1 - u) * v * bl + u * v * br);
            data[(y * W + x) * C + c] = Math.max(0, Math.min(255, Math.round(val)));
          }
        }
      }
      patches.push({ left: Math.max(0, x0 - 2), top: Math.max(0, y0 - 2), width: Math.min(W - Math.max(0, x0 - 2), bw + 4), height: Math.min(H - Math.max(0, y0 - 2), bh + 4) });
      erased++;
    }
    if (!erased) return { image: input, erased: 0 };
    const filled = await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
    // soften each filled patch a little so its edges don't show
    const soft = await Promise.all(patches.map(async (p) => ({ input: await sharp(filled).extract(p).blur(1.4).toBuffer(), left: p.left, top: p.top })));
    return { image: await sharp(filled).composite(soft).png().toBuffer(), erased };
  } catch { return { image: input, erased: 0 }; }
}
