import { useCallback, useEffect, useRef } from "react";
import { createAgentClient, type AgentClientOptions, type ConverseResult } from "./agentClient";
import type { AgentClient } from "./agentClient";

/**
 * Ciclo de vida StrictMode-safe del agentClient: el cliente se crea DENTRO
 * del efecto y se recrea en cada remontaje. Un useMemo + dispose-en-cleanup
 * no sirve acá: dispose() es permanente (sin reconexión), y StrictMode
 * ejecuta el cleanup y remonta a propósito en dev — dejaba a la app con un
 * WebSocket muerto y el converse moría por timeout en silencio.
 */
export function useAgentClient(options?: AgentClientOptions): (text: string) => Promise<ConverseResult> {
  const clientRef = useRef<AgentClient | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    clientRef.current = createAgentClient(optionsRef.current);
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  return useCallback(
    (text: string) =>
      clientRef.current
        ? clientRef.current.converse(text)
        : Promise.reject(new Error("agent client not ready")),
    [],
  );
}
