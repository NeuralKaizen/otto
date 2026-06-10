export function Captions({ text }: { text: string }) {
  return (
    <div className="hud-captions">
      <span className="demo-badge">datos de demostración</span>
      <span className="caption-text">{text}</span>
    </div>
  );
}
