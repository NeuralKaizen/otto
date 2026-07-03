import { DecryptText } from "../DecryptText";

// El descifrado arranca DESPUÉS de que la tarjeta aterriza (slot-emerge ~0.9s),
// así se ve resolver el dato sobre la tarjeta ya visible en vez de mientras aún
// está apareciendo. Un poco más largo para que se lea.
const DECRYPT_LEAD = 420;
const DECRYPT_DURATION = 1000;

export function KpiCard({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const value = (data as { value?: number } | null)?.value;
  return (
    <div className="widget kpi-card">
      <div className="widget-title">
        <DecryptText text={title} startDelay={delay + DECRYPT_LEAD} duration={DECRYPT_DURATION} />
      </div>
      {value == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <div className="kpi-value">
          <DecryptText
            text={String(value)}
            startDelay={delay + DECRYPT_LEAD}
            duration={DECRYPT_DURATION}
          />
        </div>
      )}
    </div>
  );
}
