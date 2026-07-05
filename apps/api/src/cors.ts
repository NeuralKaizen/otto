// Orígenes CORS permitidos. En dev, cualquier localhost (HUD :5173 y web :3000
// conviven); en producción, solo WEB_URL y el webview de Tauri.
export function corsOrigins(opts: { webUrl: string; nodeEnv: string }): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [opts.webUrl, "tauri://localhost", "https://tauri.localhost"];
  // Dominios de este proyecto en Vercel (producción + previews): así el HUD
  // deployado alcanza al backend sin depender de que WEB_URL matchee exacto.
  origins.push(/^https:\/\/otto-[a-z0-9-]*\.vercel\.app$/);
  if (opts.nodeEnv !== "production") origins.push(/^http:\/\/localhost:\d+$/);
  return origins;
}
