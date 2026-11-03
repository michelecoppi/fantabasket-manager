import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/icons";
import { Count } from "@/components/nav";
import type { HomeTodo } from "@/lib/home-todo";

/**
 * «Da fare» in home, subito sotto la tua franchigia: una riga per voce, prima ciò che tocca a te (icona oro), poi le
 * informazioni (icona blu). Niente blocco se non c'è niente.
 */
export function HomeTodoList({ items }: { items: HomeTodo[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-4 sm:mt-6" aria-labelledby="todo-title">
      <h2 id="todo-title" className="eyebrow mb-2 text-muted">
        Da fare
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((t, i) => (
          <li key={t.key} className="rise" style={{ "--i": i } as CSSProperties}>
            <Link href={t.href} className="group flex min-h-14 items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.action ? "bg-gold text-nav" : "bg-brand-blue/10 text-brand-blue dark:text-gold"}`}>
                <Icon name={t.icon} size={18} strokeWidth={2.2} />
              </span>
              <span className={`min-w-0 flex-1 text-sm leading-snug ${t.action ? "font-bold" : "font-semibold text-foreground/85"}`}>{t.text}</span>
              {t.action && <Count n={t.n} />}
              <Icon name="chevron" size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
