// Glyph pool for the decrypt scramble: katakana + latin + digits + symbols.
// The katakana gives the "terminal desencriptando" texture; latin/digits keep
// numbers legible mid-scramble; symbols add sci-fi noise.
export const GLYPH_POOL =
  "アイウエオカキクケコサシスセソタチツテトﾊﾋﾌﾍﾎ0123456789ABCDEFGHJKLMNPQRSTUVWXYZ#%&$@*<>/=+";

// Pure, deterministic scramble frame.
// - Characters before the resolve frontier (floor(progress*len)) show final text.
// - Spaces are always preserved (keeps word shapes readable).
// - Everything else shows a glyph chosen deterministically from `pool` using the
//   character index and the frame `tick`, so the same args always yield the same
//   string (testable) while advancing ticks animate the noise.
export function scrambleFrame(
  text: string,
  progress: number,
  pool: string,
  tick: number,
): string {
  const clamped = Math.max(0, Math.min(1, progress));
  const locked = Math.floor(clamped * text.length);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i < locked || ch === " ") {
      out += ch;
      continue;
    }
    const idx = (i * 31 + tick * 17) % pool.length;
    out += pool[idx];
  }
  return out;
}
