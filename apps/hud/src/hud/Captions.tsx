// Subtítulos de la sesión: transcripción parcial al escuchar, narración al
// hablar. El aviso de datos demo vive en el chrome superior.
export function Captions({ text }: { text: string }) {
  return (
    <div className="hud-captions">
      {text && <span className="caption-text">{text}</span>}
    </div>
  );
}
