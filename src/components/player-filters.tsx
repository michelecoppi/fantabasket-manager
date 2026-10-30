import { Icon } from "@/components/icons";
import type { Position } from "@/lib/cap";
import { POS_LABEL } from "@/lib/format";
import { naturalDir, type OwnerFilter, type PlayerFilters, type SortDir, type SortKey } from "@/lib/players";

const control = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base outline-none transition-[border-color,box-shadow] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";
const label = "eyebrow mb-1 block text-muted";
const ROLES = ["G", "A", "C"] as const;

const dirText = (sort: SortKey, dir: SortDir) => (sort === "name" ? (dir === "asc" ? "A-Z" : "Z-A") : dir === "desc" ? "Maggiore" : "Minore");

/** Barra dei filtri del listone, senza stato proprio: i valori e il filtro vero stanno in `PlayerListing`. */
export function PlayerFiltersBar({
  value,
  nbaTeams,
  withPdk,
  onChange,
  onReset,
}: {
  value: PlayerFilters;
  nbaTeams: string[];
  withPdk: boolean;
  onChange: (next: PlayerFilters) => void;
  onReset: () => void;
}) {
  const toggle = (r: Position) => onChange({ ...value, pos: ROLES.filter((x) => (x === r ? !value.pos.includes(r) : value.pos.includes(x))) });

  return (
    <form role="search" onSubmit={(e) => e.preventDefault()} className="grid grid-cols-2 items-end gap-x-2 gap-y-3 lg:grid-cols-[minmax(12rem,1.5fr)_minmax(8rem,1fr)_minmax(9rem,1.1fr)_minmax(9rem,1.1fr)_minmax(12rem,1.4fr)_auto]">
      <label className="col-span-2 lg:col-span-1">
        <span className={label}>Cerca</span>
        <span className="relative block">
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            type="search"
            enterKeyHint="search"
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            placeholder="Nome del giocatore"
            autoComplete="off"
            spellCheck={false}
            className={`${control} pl-10`}
          />
        </span>
      </label>
      {/* nessuna casella = tutti i ruoli; più caselle = uno qualsiasi dei ruoli scelti */}
      <fieldset className="col-span-2 lg:col-span-1">
        <legend className={label}>Ruolo</legend>
        <div className="flex min-h-11 gap-1.5">
          {ROLES.map((p) => (
            <label key={p} title={POS_LABEL[p]} className="flex-1">
              <input type="checkbox" checked={value.pos.includes(p)} onChange={() => toggle(p)} className="peer sr-only" />
              <span className="font-display flex h-full min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-lg font-extrabold transition-colors hover:border-foreground/40 peer-checked:border-brand-blue peer-checked:bg-brand-blue peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand-blue/15 dark:peer-checked:border-gold dark:peer-checked:bg-gold dark:peer-checked:text-nav">
                <span aria-hidden>{p}</span>
                <span className="sr-only">{POS_LABEL[p]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span className={label}>Squadra NBA</span>
        <select value={value.nbaTeam} onChange={(e) => onChange({ ...value, nbaTeam: e.target.value })} className={control}>
          <option value="">Tutte</option>
          {nbaTeams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Stato</span>
        <select value={value.owner} onChange={(e) => onChange({ ...value, owner: e.target.value as OwnerFilter })} className={control}>
          <option value="all">Tutti</option>
          <option value="free">Senza contratto (tutti)</option>
          <option value="open">Liberi (senza vincoli)</option>
          <option value="cut">Tagliati (in asta)</option>
          <option value="restricted">Restricted</option>
          <option value="taken">In rosa</option>
          <option value="talent">Talenti</option>
        </select>
      </label>
      <div className="col-span-2 lg:col-span-1">
        <span className={label}>Ordina per</span>
        <div className="flex gap-1.5">
          <select
            aria-label="Ordina per"
            value={value.sort}
            onChange={(e) => {
              const sort = e.target.value as SortKey;
              onChange({ ...value, sort, dir: naturalDir(sort) });
            }}
            className={`${control} min-w-0 flex-1`}
          >
            {withPdk && <option value="pdk">Punteggio</option>}
            <option value="credits">Crediti</option>
            <option value="name">Nome</option>
          </select>
          <button
            type="button"
            onClick={() => onChange({ ...value, dir: value.dir === "asc" ? "desc" : "asc" })}
            aria-label={`Verso: ${dirText(value.sort, value.dir)}. Tocca per invertire`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold transition-colors hover:border-foreground/40"
          >
            <Icon name="arrow-right" size={16} strokeWidth={2.4} className={value.dir === "desc" ? "rotate-90" : "-rotate-90"} />
            {dirText(value.sort, value.dir)}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="font-display col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-red px-4 text-lg font-extrabold transition-colors hover:bg-brand-red/10 lg:col-span-1"
      >
        Azzera
      </button>
    </form>
  );
}
