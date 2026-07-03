import type { LLMProvider, ChatInput, LLMChunk, LLMResponse } from "./types.js";

const MOCK_RESPONSES: Record<string, string> = {
  meeting_to_linkedin_post: `Aquí tienes 3 ideas para tu post de LinkedIn:\n\n**1. Perspectiva Profesional**\nLa automatización del CRM con Fathom y Notion no es solo eficiencia — es recuperar tiempo para enfocarte en lo que realmente importa: las relaciones con tus clientes.\n\n**2. Reflexión Personal**\nHoy en nuestra reunión tuvimos un momento "aha": cuando conectas la captura de insights de Fathom directamente con Notion, el seguimiento deja de ser trabajo manual y empieza a ser inteligencia accionable.\n\n**3. Consejo Práctico**\n3 señales de que tu CRM necesita automatización:\n→ Pierdes tiempo copiando notas de reuniones\n→ El seguimiento depende de memoria\n→ Notion y tu CRM están desconectados\n\nHerramientas como Fathom + Notion resuelven exactamente eso. #ProductividadB2B #CRM #Automatización`,

  gmail_draft: `He creado el borrador de correo según tu solicitud. Puedes revisarlo en el panel de herramientas. Recuerda que en modo mock no se envía ningún correo real — es solo una vista previa del contenido.`,

  save_memory: `Entendido, lo he guardado en tu memoria local. Puedo recuperarlo cuando lo necesites.`,

  memory_search: `He buscado en tu memoria local. Aquí están los resultados relevantes que encontré.`,

  calendar_lookup: `Revisé tu calendario. Aquí están tus próximos eventos (datos de prueba simulados — integración real con Google Calendar pendiente).`,

  system_status: `Estado del sistema:\n✅ API: operativa\n✅ Base de datos: conectada\n🤖 LLM: mock (configura LLM_PROVIDER=openai para usar IA real)\n🔇 Voice: mock\n⏱️ Timestamp: ${new Date().toISOString()}`,

  general_chat: `Hola, soy Jarvis OS en modo mock. Estoy corriendo localmente sin un LLM real activo.\n\nPuedo ayudarte con:\n\n- 📝 **LinkedIn**: "Dame ideas para un post sobre la reunión con X"\n- 📅 **Calendario**: "¿Qué tengo mañana en mi agenda?"\n- 📧 **Email**: "Crea un borrador para Daniel agradeciendo la reunión"\n- 🧠 **Memoria**: "¿Qué recuerdas sobre el proyecto Houston?"\n- ⚙️ **Sistema**: "Estado del sistema"\n\nConfigura \`LLM_PROVIDER=openai\` + \`OPENAI_API_KEY\` en \`.env\` para usar IA real.`,

  unknown: `No estoy seguro de entender lo que necesitas. Puedes pedirme ayuda con LinkedIn posts, calendario, borradores de email, búsqueda en memoria o simplemente chatear. ¿En qué te ayudo?`,
};

async function* mockStream(text: string): AsyncIterable<LLMChunk> {
  const delayMs = parseInt(process.env.STREAMING_CHUNK_DELAY_MS ?? "25", 10);
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    const delta = (i === 0 ? "" : " ") + words[i];
    yield { delta, done: false };
    await new Promise((r) => setTimeout(r, delayMs));
  }
  yield { delta: "", done: true };
}

function extractToolSummary(content: string): string | undefined {
  const markerIndex = content.lastIndexOf("Resultado de ");
  if (markerIndex === -1) return undefined;

  const jsonStart = content.indexOf("{", markerIndex);
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) return undefined;

  try {
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || !("summary" in parsed)) return undefined;
    const summary = (parsed as { summary?: unknown }).summary;
    return typeof summary === "string" && summary.trim().length > 0 ? summary : undefined;
  } catch {
    return undefined;
  }
}

export const mockProvider: LLMProvider = {
  name: "mock",

  isAvailable(): boolean {
    return true;
  },

  async *streamChat(input: ChatInput): AsyncIterable<LLMChunk> {
    const last = input.messages[input.messages.length - 1];
    const content = last?.content?.toLowerCase() ?? "";
    const structuredSummary = extractToolSummary(last?.content ?? "");

    if (structuredSummary) {
      yield* mockStream(structuredSummary);
      return;
    }

    let responseKey = "general_chat";

    if (content.includes("linkedin") || content.includes("post") || content.includes("publicación")) {
      responseKey = "meeting_to_linkedin_post";
    } else if (content.includes("correo") || content.includes("email") || content.includes("borrador") || content.includes("draft")) {
      responseKey = "gmail_draft";
    } else if (content.includes("recuerda que") || content.includes("guarda") || content.includes("anota")) {
      responseKey = "save_memory";
    } else if (content.includes("qué recuerdas") || content.includes("memoria") || content.includes("recuerdas")) {
      responseKey = "memory_search";
    } else if (content.includes("calendario") || content.includes("agenda") || content.includes("eventos")) {
      responseKey = "calendar_lookup";
    } else if (content.includes("estado") || content.includes("status") || content.includes("sistema")) {
      responseKey = "system_status";
    } else if (content.includes("hola") || content.includes("qué puedes") || content.includes("ayuda") || content.includes("help")) {
      responseKey = "general_chat";
    } else {
      responseKey = content.length < 10 ? "general_chat" : "unknown";
    }

    const response = MOCK_RESPONSES[responseKey] ?? MOCK_RESPONSES.general_chat ?? "";
    yield* mockStream(response);
  },

  async complete(input: ChatInput): Promise<LLMResponse> {
    let full = "";
    for await (const chunk of this.streamChat(input)) {
      full += chunk.delta;
    }
    return { content: full };
  },
};
