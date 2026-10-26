import { fmt } from "@/lib/format";

/**
 * Cap meter, la firma visiva della lega: payroll sul cap effettivo, con la tacca del salary floor e la parte sforata a strisce.
 * I valori arrivano da `teamFinance` (lib/cap.ts); qui solo proporzioni.
 */
export function CapLine({ payroll, cap, floor, dark = false, compact = false }: { payroll: number; cap: number; floor?: number; dark?: boolean; compact?: boolean }) {
  const over = payroll > cap;
  const scale = Math.max(cap, payroll) || 1;
  const fill = Math.min(100, Math.max(0, ((over ? cap : payroll) / scale) * 100));
  const overPct = over ? ((payroll - cap) / scale) * 100 : 0;
  const floorPct = floor !== undefined && floor > 0 ? Math.min(100, (floor / scale) * 100) : null;
  const capPct = (cap / scale) * 100;
  const below = floor !== undefined && payroll < floor;

  return (
    <div className={dark ? "text-white" : "text-foreground"} role="img" aria-label={`Monte ingaggi ${fmt(payroll)} su cap effettivo ${fmt(cap)}${over ? `, ${fmt(payroll - cap)} oltre il cap` : ""}${below ? ", sotto il salary floor" : ""}`}>
      {!compact && (
        <div className={`flex items-center justify-between gap-3 text-[0.625rem] font-bold tracking-[0.12em] uppercase ${dark ? "text-white/60" : "text-muted"}`}>
          <span className="tnum">Payroll {fmt(payroll)}</span>
          <span className="tnum">{over ? <span className={dark ? "text-[#ff8a95]" : "text-danger"}>+{fmt(payroll - cap)} oltre</span> : `Cap ${fmt(cap)}`}</span>
        </div>
      )}
      <div className={`relative ${compact ? "h-1.5" : "mt-1.5 h-2.5"} overflow-hidden rounded-full ${dark ? "bg-white/12" : "bg-foreground/[0.08]"}`}>
        <div
          className={`meter-fill absolute inset-y-0 left-0 rounded-full ${over ? "bg-brand-red" : dark ? "bg-linear-to-r from-[#4f7bff] to-gold" : "bg-linear-to-r from-brand-blue to-[#4f7bff]"}`}
          style={{ width: `${fill}%` }}
        />
        {over && <div className="meter-fill stripes absolute inset-y-0 bg-[#ff5a6a]" style={{ left: `${capPct}%`, width: `${overPct}%` }} />}
        {floorPct !== null && <span title="Salary floor" className={`absolute inset-y-0 w-0.5 ${dark ? "bg-white/70" : "bg-foreground/55"}`} style={{ left: `${floorPct}%` }} />}
        {over && <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${capPct}%` }} />}
      </div>
    </div>
  );
}
