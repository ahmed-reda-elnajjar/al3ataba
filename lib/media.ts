/**
 * The right file size for where a picture is shown.
 *  - our storage (R2): every picture has a small copy "…_s.webp" (≤480px) next to the main one (≤1600px)
 *  - old Cloudinary links: resized on their side (kept only for links that still exist)
 * Other URLs (Firebase Storage, inline data:) are returned unchanged.
 */
export function sized(url: string | undefined, w: number): string {
  if (!url) return "";
  if (/\/i\/[^?#]+\.webp$/.test(url) && !/_s\.webp$/.test(url)) return w <= 600 ? url.replace(/\.webp$/, "_s.webp") : url;
  if (!url.includes("res.cloudinary.com")) return url;
  const m = url.match(/^(.*\/(?:image|video)\/upload\/)(.*)$/);
  if (!m) return url;
  const keep: string[] = [];
  let so = "";
  for (const s of m[2].split("/")) {
    if (/^(?:[a-z]{1,3}_[^/]*)(?:,[a-z]{1,3}_[^/]*)*$/.test(s) && !/^v\d+$/.test(s)) { const x = s.match(/so_[\d.]+/); if (x) so = x[0] + ","; continue; }
    keep.push(s);
  }
  return `${m[1]}${so}w_${w},c_limit,f_auto,q_auto/${keep.join("/")}`;
}
