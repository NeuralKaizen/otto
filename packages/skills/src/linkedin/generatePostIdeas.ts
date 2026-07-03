import type { SkillDefinition, SkillContext } from "../types.js";

interface GeneratePostIdeasInput {
  message: string;
  tone?: "professional" | "personal" | "inspirational" | "concise";
  language?: "es" | "en";
}

interface PostIdea {
  title: string;
  angle: string;
  draft: string;
  hook: string;
  hashtags: string[];
}

interface LinkedInPostIdeasOutput {
  ideas: PostIdea[];
}

function extractNotes(message: string): string {
  return message.replace(/genera.*?post.*?sobre/i, "").replace(/jarvis/i, "").trim() || message;
}

export const generatePostIdeas: SkillDefinition<GeneratePostIdeasInput, LinkedInPostIdeasOutput> = {
  name: "generatePostIdeas",
  description: "Genera 3 ideas de posts para LinkedIn a partir de notas de reunión",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      tone: { type: "string", enum: ["professional", "personal", "inspirational", "concise"] },
      language: { type: "string", enum: ["es", "en"] },
    },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: [],

  async execute(args: GeneratePostIdeasInput, _ctx: SkillContext): Promise<LinkedInPostIdeasOutput> {
    const notes = extractNotes(args.message);
    const lang = args.language ?? "es";

    if (lang === "es") {
      return {
        ideas: [
          {
            title: "Perspectiva Profesional",
            angle: "Impacto en el negocio y eficiencia",
            hook: `Lo que aprendimos sobre "${notes.slice(0, 60)}..." cambió nuestra forma de trabajar.`,
            draft: `La clave no está en las herramientas, sino en cómo las conectas.\n\nEn nuestra última reunión exploramos cómo ${notes}.\n\nEl resultado: menos tiempo en tareas manuales, más tiempo en relaciones y estrategia.\n\n¿Tú ya automatizaste algún proceso este año?`,
            hashtags: ["#ProductividadB2B", "#Automatización", "#Liderazgo"],
          },
          {
            title: "Reflexión Personal",
            angle: "Historia y aprendizaje personal",
            hook: "Hoy tuve un momento 'aha' que quiero compartir contigo.",
            draft: `Hoy en nuestra reunión algo hizo clic.\n\nEstábamos hablando de ${notes}.\n\nY me di cuenta: el mayor bloqueador no era la tecnología — era el hábito de hacer las cosas "como siempre se hicieron".\n\nEl cambio empieza con una conversación. Esta fue la nuestra.`,
            hashtags: ["#Reflexión", "#CrecimientoProfesional", "#Innovación"],
          },
          {
            title: "Consejo Práctico",
            angle: "Tips accionables para tu audiencia",
            hook: "3 señales de que necesitas cambiar tu flujo de trabajo:",
            draft: `3 señales de que necesitas optimizar tu flujo de trabajo:\n\n→ Copias información entre herramientas manualmente\n→ El seguimiento depende de tu memoria\n→ Tu equipo pregunta lo mismo dos veces\n\nLo que exploramos hoy: ${notes}\n\nSi resonó con algo que vives, empieza por automatizar una sola cosa esta semana.`,
            hashtags: ["#ProductividadEjecutiva", "#FlujoDeTrabajo", "#Tips"],
          },
        ],
      };
    }

    return {
      ideas: [
        {
          title: "Professional Insight",
          angle: "Business impact and efficiency",
          hook: `What we discovered about "${notes.slice(0, 60)}..." changed how we work.`,
          draft: `The key isn't the tools — it's how you connect them.\n\nIn our last meeting we explored: ${notes}\n\nThe result: less manual work, more time for strategy and relationships.\n\nHave you automated any process this year?`,
          hashtags: ["#ProductivityB2B", "#Automation", "#Leadership"],
        },
        {
          title: "Personal Reflection",
          angle: "Personal learning and growth story",
          hook: "Today I had an 'aha' moment I want to share.",
          draft: `Today something clicked in our meeting.\n\nWe were discussing ${notes}.\n\nAnd I realized: the biggest blocker wasn't technology — it was doing things "the way we always did them".\n\nChange starts with a conversation. This was ours.`,
          hashtags: ["#Reflection", "#ProfessionalGrowth", "#Innovation"],
        },
        {
          title: "Actionable Advice",
          angle: "Practical tips for your audience",
          hook: "3 signs you need to change your workflow:",
          draft: `3 signs you need to optimize your workflow:\n\n→ You copy information between tools manually\n→ Follow-ups depend on memory\n→ Your team asks the same thing twice\n\nWhat we explored today: ${notes}\n\nIf any of this resonated, start by automating just one thing this week.`,
          hashtags: ["#ExecutiveProductivity", "#Workflow", "#Tips"],
        },
      ],
    };
  },
};
