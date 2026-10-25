import { fmt } from "@/lib/format";

export function CapLine({ payroll, cap, dark = false }: { payroll: number; cap: number; dark?: boolean }) {
  const over = payroll > cap;
  const percentage = cap > 0 ? Math.min(100, Math.max(0, (payroll / cap) * 100)) : 100;

  return (
    <div className={dark ? "text-white" : "text-foreground"} role="img" aria-label={`Monte ingaggi ${fmt(payroll)} su cap effettivo ${fmt(cap)}${over ? ", oltre il cap" : ""}`}>
      <div className={`flex items-center justify-between gap-3 text-[0.625rem] font-bold tracking-[0.12em] uppercase ${dark ? "text-neutral-400" : "text-muted"}`}>
        <span>Payroll {fmt(payroll)}</span>
        <span>Cap {fmt(cap)}</span>
      </div>
      <div className={`relative mt-1.5 h-1.5 border-x ${dark ? "border-white/40 bg-white/10" : "border-foreground/30 bg-foreground/8"}`}>
        <div className={`h-full ${over ? "bg-brand-red" : dark ? "bg-white" : "bg-brand-blue"}`} style={{ width: `${percentage}%` }} />
        <span className={`absolute top-[-3px] right-0 h-3 w-px ${dark ? "bg-white/60" : "bg-foreground/50"}`} />
      </div>
    </div>
  );
}
