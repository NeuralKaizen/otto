// Subtítulos de la sesión: transcripción parcial al escuchar, narración al
// hablar. Una sola tipografía en todas las fases (Newsreader derecha); quién
// habla lo dice la etiqueta de locutor (TÚ / ALFRED), no un cambio de fuente.
// El texto de la etiqueta y su color los pone el CSS según data-state.
export function Captions({ text }: { text: string }) {
  return (
    <div className="hud-captions" aria-live="polite">
      {text && (
        <>
          <span className="caption-speaker" aria-hidden="true" />
          <span className="caption-text">{text}</span>
        </>
      )}
    </div>
  );
}
