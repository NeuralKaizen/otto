// Narración cálida y determinística de métricas sociales (voz "mayordomo").
// No depende del LLM: la intención de métricas es por keywords y los datos ya
// vienen del skill, así que el show funciona aunque el proveedor LLM esté caído
// o sin cuota. Parseo defensivo: el resultado cruza como JSON, nada confía en el shape.

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// 34435 → "34 mil" · 128000 → "128 mil" · 1250000 → "1,2 millones" · 950 → "950"
export function numToWords(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = Math.round((n / 1_000_000) * 10) / 10;
    return `${String(m).replace(".", ",")} millones`;
  }
  if (abs >= 1000) return `${Math.round(n / 1000)} mil`;
  return `${Math.round(n)}`;
}

// Devuelve la narración cálida, o null si no hay datos para narrar (el agente
// entonces cae a su flujo normal).
export function narrateSocialMetrics(result: unknown): string | null {
  if (!isRec(result)) return null;
  const profiles = Array.isArray(result.profiles) ? result.profiles.filter(isRec) : [];
  if (profiles.length === 0) return null;

  const p = profiles[0];
  const platform =
    typeof p.platform === "string" ? PLATFORM_LABEL[p.platform] ?? p.platform : "tu red";
  const followers = toNum(p.followers) || toNum(p.subscribers);
  const rate = toNum(p.engagementRate);

  const parts: string[] = ["Con gusto, Luciano."];

  if (followers > 0 && rate > 0) {
    parts.push(
      `Tu ${platform} reúne ${numToWords(followers)} seguidores, con un engagement del ${rate
        .toFixed(1)
        .replace(".", ",")} por ciento.`
    );
  } else if (followers > 0) {
    parts.push(`Tu ${platform} reúne ${numToWords(followers)} seguidores.`);
  } else {
    parts.push(`Aquí tienes tus métricas de ${platform}.`);
  }

  const topArr = Array.isArray(p.topPosts)
    ? p.topPosts
    : Array.isArray(p.recentContent)
    ? p.recentContent
    : [];
  const top = topArr.filter(isRec)[0];
  if (top) {
    const rawTitle = typeof top.title === "string" ? top.title.trim() : "";
    const v = toNum(top.likes) || toNum(top.views) || toNum(top.impressions);
    if (v > 0) {
      // Un caption largo o multilínea no se lee en voz; solo se describe.
      const readable = rawTitle && rawTitle.length <= 28 && !rawTitle.includes("\n");
      parts.push(
        readable
          ? `Tu "${rawTitle}" lidera con ${numToWords(v)} interacciones.`
          : `Tu contenido más destacado supera las ${numToWords(v)} interacciones.`
      );
    }
  }

  if (profiles.length > 1) {
    parts.push(`Y tienes ${profiles.length} plataformas en seguimiento.`);
  }

  if (rate >= 3) parts.push("Vas muy bien.");
  else if (followers >= 10000) parts.push("Buena base para crecer, Luciano.");

  return parts.join(" ");
}
