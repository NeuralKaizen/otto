export function KpiCard({ title, data }: { title: string; data: unknown }) {
  const value = (data as { value?: number } | null)?.value;
  return (
    <div className="widget kpi-card">
      <div className="widget-title">{title}</div>
      {data == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <div className="kpi-value">{value}</div>
      )}
    </div>
  );
}
