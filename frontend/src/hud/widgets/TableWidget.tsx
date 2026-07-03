import { DecryptText } from "../DecryptText";

// Ver KpiCard: el descifrado arranca tras el aterrizaje de la tarjeta.
const DECRYPT_LEAD = 420;
const DECRYPT_DURATION = 1000;

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
        <DecryptText text={title} startDelay={delay + DECRYPT_LEAD} duration={DECRYPT_DURATION} />
      </div>
      {rows == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <table>
          <thead>
            <tr>
              {Object.keys(rows[0] ?? {}).map((k) => (
                <th key={k}>
                  <DecryptText
                    text={k}
                    startDelay={delay + DECRYPT_LEAD}
                    duration={DECRYPT_DURATION}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((v, j) => (
                  <td key={j}>
                    <DecryptText
                      text={String(v)}
                      startDelay={delay + DECRYPT_LEAD}
                      duration={DECRYPT_DURATION}
                    />
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
