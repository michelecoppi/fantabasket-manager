import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { fpt, type TeamIndex } from "@/components/dunkest-league";
import type { HistoryPoint } from "@/lib/standings-history";

/*
 * Andamento in classifica (Fase 6.4): bump chart disegnato dal server, senza librerie né JavaScript. Le linee stanno in un SVG
 * che si stira sul contenitore (tratto non scalato), punti, etichette e stemmi sono HTML posizionato in percentuale: così il
 * grafico riempie qualunque larghezza senza deformare testo e cerchi. Con molte giornate l'area scorre in orizzontale dentro
 * la carta (mai la pagina) e parte dall'ultima giornata (`dir="rtl"` sul contenitore). Una squadra in evidenza (la mia, o
 * quella scelta in legenda con `?evidenzia=`), le altre tenui. Tabella nascosta con gli stessi dati per i lettori di schermo.
 */

export type ChartMode = "position" | "points";

const PAD = 6; // margine interno in % perché cerchi e linee non tocchino i bordi
/** Oltre queste giornate l'area scorre: ogni colonna ha almeno 1,75rem (circa 12 giornate visibili su telefono). */
const SCROLL_FROM = 12;

const team = (teams: TeamIndex, id: string) => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };

/** Allontana le etichette troppo vicine (in % dell'altezza), tenendo l'ordine, dentro [PAD, 100 − PAD]. */
function spread(items: { id: string; y: number }[], gap: number): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const ys = sorted.map((x) => x.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  const over = ys.length ? ys[ys.length - 1] - (100 - PAD) : 0;
  return new Map(sorted.map((x, i) => [x.id, Math.max(PAD, ys[i] - Math.max(0, over))]));
}

export function StandingsChart({
  history,
  teams,
  highlight,
  mode,
  hrefFor,
}: {
  history: HistoryPoint[];
  teams: TeamIndex;
  /** squadra in evidenza (null = nessuna) */
  highlight: string | null;
  mode: ChartMode;
  /** link della legenda per mettere in evidenza un'altra squadra */
  hrefFor: (teamId: string) => string;
}) {
  const n = history.length;
  const last = history[n - 1];
  const ids = last.rows.map((r) => r.teamId);
  const count = ids.length;
  const max = Math.max(1, ...last.rows.map((r) => r.totalPts));
  const x = (i: number) => (n === 1 ? 50 : PAD + (i * (100 - 2 * PAD)) / (n - 1));
  const y = (r: { position: number; totalPts: number }) =>
    mode === "position" ? PAD + ((r.position - 1) * (100 - 2 * PAD)) / Math.max(1, count - 1) : PAD + (1 - r.totalPts / max) * (100 - 2 * PAD);
  const series = ids.map((id) => ({
    id,
    points: history.map((h, i) => {
      const r = h.rows.find((row) => row.teamId === id)!;
      return { x: x(i), y: y(r), r };
    }),
  }));
  // la squadra in evidenza si disegna per ultima, sopra le altre
  const ordered = [...series].sort((a, b) => Number(a.id === highlight) - Number(b.id === highlight));
  // stemmi a fine linea: a parità di posizione (o con punti vicini) si allontanano quanto basta per non coprirsi
  const ends = spread(
    series.map((s) => ({ id: s.id, y: s.points[n - 1].y })),
    100 / (count + 2),
  );
  const scroll = n > SCROLL_FROM;
  const height = "h-64 sm:h-72";

  return (
    <figure className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex gap-2">
        {/* asse: posizioni o punti */}
        <div aria-hidden className={`relative w-7 shrink-0 ${height}`}>
          {mode === "position"
            ? Array.from({ length: count }, (_, i) => (
                <span key={i} className="font-display tnum absolute right-0 -translate-y-1/2 text-sm leading-none font-extrabold text-muted" style={{ top: `${PAD + (i * (100 - 2 * PAD)) / Math.max(1, count - 1)}%` }}>
                  {i + 1}°
                </span>
              ))
            : [max, max / 2, 0].map((v) => (
                <span key={v} className="tnum absolute right-0 -translate-y-1/2 text-[0.625rem] leading-none font-bold text-muted" style={{ top: `${PAD + (1 - v / max) * (100 - 2 * PAD)}%` }}>
                  {Math.round(v)}
                </span>
              ))}
        </div>

        <div dir="rtl" className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
          <div dir="ltr" style={{ minWidth: scroll ? `${n * 1.75}rem` : undefined }}>
            <div className={`relative ${height}`}>
              <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                {(mode === "position" ? Array.from({ length: count }, (_, i) => PAD + (i * (100 - 2 * PAD)) / Math.max(1, count - 1)) : [PAD, 50, 100 - PAD]).map((gy) => (
                  <line key={gy} x1="0" x2="100" y1={gy} y2={gy} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
                ))}
                {ordered.map((s) => {
                  const on = s.id === highlight;
                  return (
                    <polyline
                      key={s.id}
                      points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={team(teams, s.id).color}
                      strokeWidth={on ? 4 : 2}
                      strokeOpacity={highlight && !on ? 0.3 : 0.95}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>
              {ordered.map((s) => {
                const on = s.id === highlight;
                const color = team(teams, s.id).color;
                return s.points.map((p, i) => (
                  <span
                    key={`${s.id}-${i}`}
                    aria-hidden
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${on ? "h-3 w-3 ring-2 ring-surface" : "h-2 w-2"}`}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, background: color, opacity: highlight && !on ? 0.4 : 1 }}
                  />
                ));
              })}
            </div>
            <div aria-hidden className="relative mt-2 h-4">
              {history.map((h, i) => (
                <span key={h.matchday} className="tnum absolute -translate-x-1/2 text-[0.625rem] font-bold text-muted" style={{ left: `${x(i)}%` }}>
                  G{h.matchday}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* stemmi a fine linea, nell'ordine dell'ultima giornata */}
        <div aria-hidden className={`relative w-7 shrink-0 ${height}`}>
          {series.map((s) => {
            const t = team(teams, s.id);
            return (
              <span key={s.id} className={`absolute left-0 -translate-y-1/2 ${highlight && s.id !== highlight ? "opacity-45" : ""}`} style={{ top: `${ends.get(s.id)}%` }}>
                <TeamCrest name={t.name} color={t.color} size="xs" mine={s.id === highlight} />
              </span>
            );
          })}
        </div>
      </div>

      <figcaption className="mt-3 border-t border-line pt-3">
        <span className="sr-only">Legenda: tocca una squadra per metterla in evidenza.</span>
        <ul className="flex flex-wrap gap-1.5">
          {last.rows.map((r) => {
            const t = team(teams, r.teamId);
            const on = r.teamId === highlight;
            return (
              <li key={r.teamId}>
                <Link
                  href={hrefFor(r.teamId)}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5 text-xs font-semibold transition-colors ${on ? "border-foreground/50 bg-surface-subtle" : "border-line hover:border-foreground/40"}`}
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  <span className="max-w-32 truncate">{t.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </figcaption>

      <table className="sr-only">
        <caption>{mode === "position" ? "Posizione in classifica dopo ogni giornata" : "Punti totali dopo ogni giornata"}</caption>
        <thead>
          <tr>
            <th scope="col">Squadra</th>
            {history.map((h) => (
              <th key={h.matchday} scope="col">
                Giornata {h.matchday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id}>
              <th scope="row">{team(teams, s.id).name}</th>
              {s.points.map((p, i) => (
                <td key={i}>{mode === "position" ? `${p.r.position}°` : fpt(p.r.totalPts)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Mini linea della posizione per la pagina squadra (1° in alto). */
export function PositionSparkline({ points, teams, color, className = "" }: { points: { matchday: number; position: number }[]; teams: number; color: string; className?: string }) {
  if (points.length < 2) return null;
  const w = 88;
  const h = 30;
  const px = (i: number) => 3 + (i * (w - 6)) / (points.length - 1);
  const py = (pos: number) => 3 + ((pos - 1) * (h - 6)) / Math.max(1, teams - 1);
  const end = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={`shrink-0 overflow-visible ${className}`} role="img" aria-label={`Posizione giornata per giornata: ${points.map((p) => `${p.position}°`).join(", ")}`}>
      <line x1="0" x2={w} y1={py(1)} y2={py(1)} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 3" />
      <polyline points={points.map((p, i) => `${px(i)},${py(p.position)}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(points.length - 1)} cy={py(end.position)} r="3.5" fill={color} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
