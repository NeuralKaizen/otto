import { useEffect, useState } from "react";
import { fetchStatus, type ProviderStatus } from "../lib/api.js";

export interface SystemStatus {
  provider: string;
  model: string | null;
  realLLMEnabled: boolean;
}

const DEFAULT_STATUS: SystemStatus = {
  provider: "mock",
  model: null,
  realLLMEnabled: false,
};

export function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>(DEFAULT_STATUS);

  useEffect(() => {
    let cancelled = false;

    void fetchStatus()
      .then((data) => {
        const provider = data.provider;
        if (!provider || cancelled) {
          return;
        }

        const normalized: ProviderStatus = provider;
        setStatus({
          provider: normalized.active ?? "mock",
          model: normalized.model ?? null,
          realLLMEnabled: Boolean(normalized.realLLMEnabled),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(DEFAULT_STATUS);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
