/**
 * Resized delivery for Cloudinary images: the card gets a ~400px file instead of the multi-MB original.
 * Other URLs (Firebase Storage, inline data:) are returned unchanged.
 */
export function sized(url: string | undefined, w: number): string {
  if (!url || !url.includes("res.cloudinary.com")) return url || "";
  const m = url.match(/^(.*\/(?:image|video)\/upload\/)(.*)$/);
  if (!m) return url;
  let rest = m[2];
  // drop our own previous transformation segment (f_auto,q_auto:best / so_0 / q_auto) but keep the rest of the path
  const seg = rest.split("/");
  const keep: string[] = [];
  let so = "";
  for (const s of seg) {
    if (/^(?:[a-z]{1,3}_[^/]*)(?:,[a-z]{1,3}_[^/]*)*$/.test(s) && !/^v\d+$/.test(s)) { const x = s.match(/so_[\d.]+/); if (x) so = x[0] + ","; continue; }
    keep.push(s);
  }
  rest = keep.join("/");
  const isVideoPoster = m[1].includes("/video/upload/");
  return `${m[1]}${so}w_${w},c_limit,f_auto,q_auto${isVideoPoster ? "" : ""}/${rest}`;
}
