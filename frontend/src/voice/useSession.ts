import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reduce, initialState } from "./sessionMachine";
import type {
  SessionState,
  SessionEvent,
  Effect,
  RenderedWidget,
  WakeWordDetector,
  Transcriber,
  Speaker,
} from "./types";

interface Deps {
  wake: WakeWordDetector;
  stt: Transcriber;
  tts: Speaker;
  converse: (text: string) => Promise<{ narration: string; widgets: RenderedWidget[] }>;
  closingPhrase: string;
  silenceMs: number;
}

export function useSession(deps: Deps) {
  const [state, setState] = useState<SessionState>(initialState);
  const [caption, setCaption] = useState("");
  const [widgets, setWidgets] = useState<RenderedWidget[]>([]);
  const stateRef = useRef<SessionState>(initialState);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store dispatch in a ref so runEffects can call it without a circular
  // useCallback dependency (runEffects is declared before dispatch, but needs
  // to invoke it; keeping it in a ref breaks the ordering constraint while
  // ensuring the closure always reads the latest version).
  const dispatchRef = useRef<(event: SessionEvent) => void>(() => {
    /* will be replaced before first use */
  });

  const runEffects = useCallback(
    (effects: Effect[]) => {
      for (const eff of effects) {
        switch (eff.kind) {
          case "startListening":
            deps.stt.start(
              (partial) => {
                setCaption(partial);
                dispatchRef.current({ kind: "transcript", text: partial, final: false });
              },
              (final) => {
                setCaption(final);
                if (final.toLowerCase().includes(deps.closingPhrase)) {
                  dispatchRef.current({ kind: "closingPhrase" });
                } else {
                  dispatchRef.current({ kind: "transcript", text: final, final: true });
                  dispatchRef.current({ kind: "speechEnd" });
                }
              },
            );
            break;
          case "stopListening":
            deps.stt.stop();
            break;
          case "stopSpeaking":
            deps.tts.stop();
            break;
          case "speak":
            deps.tts.speak(eff.text, () => dispatchRef.current({ kind: "ttsEnd" }));
            break;
          case "render":
            setWidgets(eff.widgets);
            break;
          case "callConverse":
            deps.converse(eff.text).then((r) =>
              dispatchRef.current({ kind: "response", narration: r.narration, widgets: r.widgets }),
            );
            break;
          case "armSilenceTimer":
            if (silenceTimer.current) clearTimeout(silenceTimer.current);
            silenceTimer.current = setTimeout(
              () => dispatchRef.current({ kind: "timeout" }),
              deps.silenceMs,
            );
            break;
          case "disarmSilenceTimer":
            if (silenceTimer.current) clearTimeout(silenceTimer.current);
            break;
        }
      }
    },
    [deps],
  );

  const dispatch = useCallback(
    (event: SessionEvent) => {
      const { state: next, effects } = reduce(stateRef.current, event);
      stateRef.current = next;
      setState(next);
      runEffects(effects);
    },
    [runEffects],
  );

  // Keep the ref in sync with the latest dispatch after every render so
  // runEffects closures (e.g. speak onEnd, converse .then) always call the
  // current version.
  dispatchRef.current = dispatch;

  useEffect(() => {
    deps.wake.start(() => dispatch({ kind: "wakeDetected" }));
    return () => deps.wake.stop();
  }, [deps, dispatch]);

  return useMemo(
    () => ({
      state,
      caption,
      widgets,
      _debugSpeechEnd: () => dispatch({ kind: "speechEnd" }),
    }),
    [state, caption, widgets, dispatch],
  );
}
