import type { SkillDefinition, SkillContext } from "../types.js";

interface GmailDraftInput {
  message: string;
  to?: string;
  subject?: string;
}

interface GmailDraftOutput {
  draft: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
  };
  source: "mock";
  note: string;
}

function extractRecipient(message: string): string {
  const m = message.toLowerCase();
  const forPatterns = [
    /para\s+([A-Za-záéíóúÁÉÍÓÚñÑ]+)/i,
    /a\s+([A-Za-záéíóúÁÉÍÓÚñÑ]+)/i,
    /to\s+([A-Za-z]+)/i,
  ];
  for (const pattern of forPatterns) {
    const match = m.match(pattern);
    if (match?.[1] && match[1].length > 2) {
      const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      return `${name.toLowerCase()}@example.com`;
    }
  }
  return "destinatario@example.com";
}

function extractSubject(message: string): string {
  if (message.toLowerCase().includes("agradeciendo")) return "Gracias por la reunión";
  if (message.toLowerCase().includes("seguimiento")) return "Seguimiento de nuestra conversación";
  if (message.toLowerCase().includes("propuesta")) return "Propuesta de colaboración";
  if (message.toLowerCase().includes("reunión") || message.toLowerCase().includes("reunion")) return "Resumen de reunión";
  return "Mensaje de Wattson OS";
}

function generateBody(message: string, to: string, subject: string): string {
  const firstName = to.split("@")[0] ?? "equipo";
  const cap = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  if (subject.includes("Gracias")) {
    return `Hola ${cap},\n\nQuería tomarme un momento para agradecerte el tiempo que dedicaste en nuestra reunión. Fue muy valioso y aprecio tu disposición.\n\nQuedo atento a los próximos pasos que acordamos.\n\nSaludos cordiales,\nJose\n\n---\n[Borrador generado por Wattson OS — modo mock]`;
  }

  return `Hola ${cap},\n\nEscribo en relación a: ${message.slice(0, 120)}.\n\nMe gustaría coordinar los próximos pasos. ¿Tienes disponibilidad esta semana?\n\nSaludos,\nJose\n\n---\n[Borrador generado por Wattson OS — modo mock]`;
}

export const gmailDraftMock: SkillDefinition<GmailDraftInput, GmailDraftOutput> = {
  name: "gmailDraftMock",
  description: "Crea un borrador de correo en Gmail (modo mock — no envía nada)",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      to: { type: "string" },
      subject: { type: "string" },
    },
    required: ["message"],
  },
  requiresApproval: true,
  riskLevel: "medium",
  permissions: ["gmail:write"],

  async execute(args: GmailDraftInput, _ctx: SkillContext): Promise<GmailDraftOutput> {
    const to = args.to ?? extractRecipient(args.message);
    const subject = args.subject ?? extractSubject(args.message);
    const body = generateBody(args.message, to, subject);

    return {
      draft: { to, subject, body },
      source: "mock",
      note: "Borrador creado en modo mock. No se envió ningún correo real.",
    };
  },
};
