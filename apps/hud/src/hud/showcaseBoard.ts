import type { RenderedWidget } from "../voice/types";

// Tablero curado para el video (showcase). Los MISMOS números que narra el
// backend en modo SOCIAL_SHOWCASE, para que voz y pantalla sean coherentes.
// Se usa tanto en el modo vitrina (?hud=speaking / Espacio) como en el modo
// showcase por voz (?showcase=1), donde reemplaza a los widgets crudos del skill.
export const SHOWCASE_CAPTION =
  "Tus métricas de Instagram, Luciano: 34.4 mil seguidores, engagement del 4.2% y en alza.";

export const SHOWCASE_WIDGETS: RenderedWidget[] = [
  { type: "kpi_card", title: "Seguidores", data: { value: "34.4K", delta: "+3.1%", spark: [30, 31, 31, 32, 33, 33, 34] } },
  { type: "kpi_card", title: "Engagement", data: { value: "4.2%", delta: "+0.4pt", spark: [3.6, 3.8, 3.7, 4.0, 4.1, 4.0, 4.2] } },
  { type: "kpi_card", title: "Alcance 7d", data: { value: "128K", delta: "+12%", spark: [90, 96, 101, 110, 116, 121, 128] } },
  { type: "kpi_card", title: "Guardados", data: { value: "2.1K", delta: "-2%", spark: [2.3, 2.2, 2.2, 2.1, 2.0, 2.1, 2.1] } },
  {
    type: "metric_chart",
    title: "Top contenido",
    data: {
      subtitle: "@lucianomusellaa · instagram",
      unit: "likes",
      points: [
        { name: "Reel gym", value: 12800 },
        { name: "Carrusel", value: 9400 },
        { name: "Colab", value: 7100 },
        { name: "Story set", value: 5200 },
        { name: "Live Q&A", value: 3600 },
      ],
    },
  },
  {
    type: "metric_chart",
    title: "Alcance · 7d",
    data: {
      subtitle: "impresiones / día",
      unit: "imp",
      points: [
        { name: "Lu", value: 90000 },
        { name: "Ma", value: 96000 },
        { name: "Mi", value: 101000 },
        { name: "Ju", value: 110000 },
        { name: "Vi", value: 116000 },
        { name: "Sá", value: 121000 },
        { name: "Do", value: 128000 },
      ],
    },
  },
  {
    type: "table",
    title: "Por plataforma",
    data: [
      { red: "Instagram", segs: "34.4K", eng: "4.2%" },
      { red: "TikTok", segs: "18.9K", eng: "6.1%" },
      { red: "YouTube", segs: "7.2K", eng: "3.4%" },
    ],
  },
];
