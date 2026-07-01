import { DecryptText } from "../DecryptText";

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
        <DecryptText text={title} startDelay={delay} />
      </div>
      {data == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <div className="kpi-value">
          <DecryptText text={String(value)} startDelay={delay} />
        </div>
      )}
    </div>
  );
}
