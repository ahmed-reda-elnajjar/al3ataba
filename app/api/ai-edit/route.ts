/* Edit a (preview) product photo with a free-text instruction, like chatting with an AI (admin only).
 *  - engine "gemini": the instruction + picture go straight to Gemini's image model (needs billing on Google AI Studio)
 *  - otherwise: a text AI (free keys, rotating) turns the instruction into Cloudinary AI edits
 *    (remove/replace/recolor objects, background, zoom, rotate, brightness, sharpen, keep only one object…) */
import { isAdminToken } from "@/lib/serverAuth";
import { aiGenerate } from "@/lib/ai";
import { sized } from "@/lib/media";
import { redraw } from "@/lib/aiImage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || "dvefx5ts8";
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET || "hh3sejta";
const err = (msg: string, status = 500) => Object.assign(new Error(msg), { status });
const word = (x: unknown) => String(x || "").toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const enc = (x: unknown) => encodeURIComponent(word(x));
const num = (x: unknown, lo: number, hi: number, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const hex = (x: unknown) => { const m = String(x || "").match(/#?([0-9a-f]{6})/i); return m ? m[1].toUpperCase() : ""; };

type Op = { op: string; what?: string | string[]; from?: string; to?: string; color?: string; scale?: number; deg?: number; v?: number };

const PLAN = (instr: string) => `You turn a shop owner's photo-edit request (Arabic or English) into a JSON list of image operations for a product photo.
Allowed operations (use only these, in a sensible order):
- {"op":"remove","what":["hand","sticker","price tag"]}  erase objects and fill naturally
- {"op":"replace","from":"plastic bag","to":"cardboard box"}
- {"op":"recolor","what":"phone case","color":"#1E3A8A"}
- {"op":"background","to":"white"} | {"op":"background","to":"studio"} | {"op":"background","to":"<short english scene description>"}
- {"op":"keep_only","what":"earphones"}  keep just this object on a white background
- {"op":"zoom","scale":1.2}  make the product bigger (>1) or smaller (<1) in the frame
- {"op":"rotate","deg":90} | {"op":"flip"}
- {"op":"brightness","v":20} | {"op":"contrast","v":20} | {"op":"saturation","v":20} | {"op":"sharpen","v":60}  v between -100 and 100
- {"op":"restore"}  fix blur / compression and upscale
Object names must be short English nouns. If the request cannot be done with these, return an empty list and explain in "note" (Arabic).
Return JSON only: {"ops":[...],"note":"short Arabic summary of what you will do"}

Request: ${instr}`;

function parsePlan(t: string): { ops: Op[]; note: string }[] {
  const m = t.match(/\{[\s\S]*\}/);
  const j = JSON.parse(m ? m[0] : t);
  return [{ ops: Array.isArray(j.ops) ? j.ops.slice(0, 8) : [], note: String(j.note || "") }];
}

/** Build the Cloudinary URL that applies the plan to the current image. */
function build(src: string, ops: Op[]) {
  const m = src.match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*?v\d+\/(.+?)(\.[a-z0-9]+)?$/i);
  if (!m) throw err("الصورة مش بصيغة نقدر نعدلها", 400);
  const id = m[1], ext = m[2] || ".jpg", layer = id.replace(/\//g, ":");
  const steps: string[] = ["c_limit,w_1600,h_1600"];
  let bg = "", zoom = 1, keep = "";
  for (const o of ops) {
    const list = (Array.isArray(o.what) ? o.what : [o.what]).map(enc).filter(Boolean);
    switch (o.op) {
      case "remove": if (list.length) steps.push(`e_gen_remove:prompt_${list.length > 1 ? `(${list.join(";")});multiple_true` : list[0]}`); break;
      case "replace": if (word(o.from) && word(o.to)) steps.push(`e_gen_replace:from_${enc(o.from)};to_${enc(o.to)}`); break;
      case "recolor": if (list[0] && hex(o.color)) steps.push(`e_gen_recolor:prompt_${list[0]};to-color_${hex(o.color)}`); break;
      case "background": bg = ["white", "studio"].includes(word(o.to)) ? word(o.to) : `scene:${enc(o.to)}`; break;
      case "keep_only": keep = list[0] || ""; if (!bg) bg = "white"; break;
      case "zoom": zoom = Math.max(0.5, Math.min(1.6, Number(o.scale) || 1)); if (!bg) bg = "white"; break;
      case "rotate": steps.push(`a_${num(o.deg, -360, 360, 90)}`); break;
      case "flip": steps.push("a_hflip"); break;
      case "brightness": steps.push(`e_brightness:${num(o.v, -99, 100, 15)}`); break;
      case "contrast": steps.push(`e_contrast:${num(o.v, -100, 100, 15)}`); break;
      case "saturation": steps.push(`e_vibrance:${num(o.v, -100, 100, 20)}`); break;
      case "sharpen": steps.push(`e_sharpen:${num(o.v, 1, 2000, 80)}`); break;
      case "restore": steps.push("c_limit,w_900,h_900", "e_gen_restore", "e_upscale"); break;
    }
  }
  if (bg.startsWith("scene:")) { steps.push(`e_gen_background_replace:prompt_${bg.slice(6)}`); bg = ""; }
  const chain = steps.join("/");
  if (!bg) return `https://res.cloudinary.com/${CLD}/image/upload/${chain}/q_auto:best/f_jpg/${id}${ext}`;
  // put the (edited) product on a clean background
  const cutout = keep ? `e_extract:prompt_${keep}` : "e_background_removal";
  const size = Math.round(1500 * zoom);
  const base = bg === "studio"
    ? `c_scale,w_2000,h_2000/e_colorize:100,co_rgb:F3F0EA/l_${layer},c_scale,w_2000,h_860,e_colorize:100,co_rgb:F0DCC4/fl_layer_apply,g_south`
    : `c_scale,w_2000,h_2000/e_colorize:100,co_rgb:FFFFFF`;
  return `https://res.cloudinary.com/${CLD}/image/upload/${base}/l_${layer}/${chain}/${cutout}/e_trim/c_fit,w_${Math.min(size, 1900)},h_${Math.min(size, 1900)}/fl_layer_apply,g_center${bg === "studio" ? ",y_120" : ""}/q_auto:best/f_jpg/${id}${ext}`;
}

async function upload(file: string) {
  const body = new FormData();
  body.append("file", file); body.append("upload_preset", PRESET); body.append("folder", "al3ataba/studio");
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLD}/image/upload`, { method: "POST", body });
  const j = await r.json();
  if (!j.secure_url) throw err(j?.error?.message || "upload failed");
  return String(j.secure_url).replace("/upload/", "/upload/f_auto,q_auto:best/");
}

async function geminiEdit(url: string, instr: string) {
  const img = await fetch(sized(url, 1024).replace("f_auto", "f_jpg"));
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  const r = await redraw(b64, `Edit this product photo exactly as requested, keep everything else (especially the product itself and its details) unchanged, keep it a clean professional e-commerce photo, high resolution. Request: ${instr}`, sized(url, 500).replace("w_500,c_limit", "w_500,h_500,c_limit").replace("f_auto", "f_jpg"));
  return { image: await upload(r.dataUrl), by: r.by };
}

export async function POST(req: Request) {
  if (!(await isAdminToken(req.headers.get("x-firebase-token") || ""))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { url, instruction, engine, original } = (await req.json()) as { url: string; instruction: string; engine?: "auto" | "gemini"; original?: string };
  const instr = String(instruction || "").trim().slice(0, 500);
  if (!url?.includes("res.cloudinary.com") || !instr) return Response.json({ error: "اكتب التعديل المطلوب" }, { status: 400 });
  try {
    if (engine === "gemini") { const g = await geminiEdit(original && /أمام|زاوية|front|angle/i.test(instr) ? original : url, instr); return Response.json({ image: g.image, note: `اتعدلت بإعادة الرسم`, by: g.by }); }
    const { out, provider } = await aiGenerate(PLAN(instr), parsePlan);
    const plan = out[0];
    if (!plan?.ops?.length) {
      // needs a real redraw (e.g. "from the front") → try the image models automatically
      try { const g = await geminiEdit(original && /أمام|زاوية|front|angle/i.test(instr) ? original : url, instr); return Response.json({ image: g.image, note: "اتعدلت بإعادة الرسم", by: g.by }); }
      catch (e) { return Response.json({ error: `${plan?.note || "التعديل ده محتاج إعادة رسم."} — ${String((e as Error).message)}`, by: provider }, { status: 422 }); }
    }
    // "keep only X" needs the original photo (the preview may only show the box, so X isn't there anymore)
    const needsOriginal = plan.ops.some((o) => o.op === "keep_only") && original?.includes("res.cloudinary.com");
    const target = build(needsOriginal ? original! : url, plan.ops);
    let ok = false, why = "";
    for (let i = 0; i < 4 && !ok; i++) { const w = await fetch(target, { cache: "no-store" }); ok = w.ok; why = w.headers.get("x-cld-error") || String(w.status); if (!ok) await new Promise((r) => setTimeout(r, 4000)); }
    if (!ok) throw err(/extract/i.test(why) ? `مالقيتش "${plan.ops.find((o) => o.op === "keep_only")?.what || "المنتج"}" في الصورة — جرّب اسم تاني (زي "المنتج بس" أو "كلمات مخصوصة")` : `Cloudinary: ${why}`, 422);
    return Response.json({ image: await upload(target), note: plan.note, ops: plan.ops, by: provider });
  } catch (e) {
    const x = e as Error & { status?: number };
    return Response.json({ error: String(x.message || e) }, { status: x.status || 500 });
  }
}
