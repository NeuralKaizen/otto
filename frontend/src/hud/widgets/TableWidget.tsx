import { DecryptText } from "../DecryptText";

export function TableWidget({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  return (
    <div className="widget table-widget">
      <div className="widget-title">
        <DecryptText text={title} startDelay={delay} />
      </div>
      {rows == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <table>
          <thead>
            <tr>
              {Object.keys(rows[0] ?? {}).map((k) => (
                <th key={k}>
                  <DecryptText text={k} startDelay={delay} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((v, j) => (
                  <td key={j}>
                    <DecryptText text={String(v)} startDelay={delay} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
