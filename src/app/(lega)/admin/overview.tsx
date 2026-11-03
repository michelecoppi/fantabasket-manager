import Link from "next/link";
import type { AdminTodo } from "@/lib/admin-todo";
import { Icon } from "@/components/icons";
import { Count, type NavBadges } from "@/components/nav";
import { stagger } from "@/components/ui";
import { adminTools } from "./tools";

/**
 * Da dove arriva il numerino rosso su «Admin»: una riga per coda, col link alla sezione che la gestisce.
 * Chiuso di default (richiesta dell'utente, per non spingere giù gli strumenti): si vede solo il totale, un tocco lo apre.
 */
export function TodoList({ todo }: { todo: AdminTodo[] }) {
  if (todo.length === 0) return null;
  const total = todo.reduce((n, t) => n + t.n, 0);
  return (
    <details className="group/todo rise mb-6 overflow-hidden rounded-2xl border border-brand-red/35 bg-surface">
      <summary className="relative flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="font-display text-2xl leading-none font-extrabold">Da gestire</span>
        <Count n={total} />
        <span className="ml-auto flex items-center gap-2 text-xs font-bold text-muted">
          <span className="group-open/todo:hidden">Mostra</span>
          <Icon name="chevron" size={18} strokeWidth={2.2} className="rotate-90 transition-transform group-open/todo:-rotate-90" />
        </span>
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {todo.map((t) => (
          <li key={t.text}>
            <Link href={t.href} className="group relative flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-subtle">
              <Count n={t.n} />
              <span className="min-w-0 flex-1">{t.text}</span>
              <span className="shrink-0 text-xs font-bold text-muted">{adminTools.find((x) => x.href === t.tool)?.label}</span>
              <Icon name="arrow-right" size={16} strokeWidth={2.2} className="shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Carte degli strumenti, col pallino di quelli che hanno lavoro in coda (`adminTodoCounts`). */
export function ToolGrid({ counts }: { counts: NavBadges }) {
  return (
    // Con un numero dispari di strumenti l'ultimo prende due colonne: nessun buco in fondo alla griglia.
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:[&>:last-child:nth-child(odd)]:col-span-2">
      {adminTools.map((t, i) => (
        <Link key={t.href} href={t.href} className="lift group rise relative overflow-hidden rounded-2xl border border-line bg-surface p-5 hover:border-foreground/25" style={stagger(i)}>
          <span aria-hidden className="absolute -top-6 -right-6 text-foreground/[0.04] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12">
            <Icon name={t.icon} size={120} strokeWidth={1.25} />
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue dark:bg-nav dark:text-gold transition-transform duration-300 group-hover:scale-105">
            <Icon name={t.icon} size={22} strokeWidth={2} />
          </span>
          <h2 className="font-display mt-4 flex items-center gap-1.5 text-3xl leading-none font-black">
            {t.label}
            <Count n={counts[t.href]} />
            <Icon name="arrow-right" size={18} strokeWidth={2.2} className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
          </h2>
          <p className="relative mt-2 text-sm text-muted">{t.text}</p>
        </Link>
      ))}
    </div>
  );
}
