export function TableWidget({ title, data }: { title: string; data: unknown }) {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  return (
    <div className="widget table-widget">
      <div className="widget-title">{title}</div>
      {rows == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <table>
          <thead>
            <tr>{Object.keys(rows[0] ?? {}).map((k) => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
