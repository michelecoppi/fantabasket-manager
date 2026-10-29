"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, Field, inputClass } from "@/components/controls";
import { GroupTitle, NoticeBar, ProposalCard, useConfirm, useRun, type Notice, type ProposalContext } from "@/components/trade-proposal";
import type { SimTeam } from "@/components/trade-parts";
import { Empty } from "@/components/ui";
import type { LeagueSettings } from "@/lib/cap";
import type { Proposal, ProposalGroups } from "@/lib/trade-proposals";
import { answerProposal, withdrawProposal } from "./actions";

const ARCHIVE_SHOWN = 20;

/**
 * Vista `/scambio?vista=proposte` (Fase 7.3): da rispondere (con il conto alla rovescia), in corso, quelle delle altre squadre
 * (solo admin) e l'archivio. L'esito di ogni proposta è sulle rose di adesso.
 */
export function ProposalsView({
  groups,
  teams,
  settings,
  myTeamId,
  market,
  adminQueue,
}: {
  groups: ProposalGroups;
  teams: SimTeam[];
  settings: LeagueSettings;
  myTeamId: string | null;
  market: boolean | null;
  /** solo per gli admin: proposte che aspettano l'approvazione o Dunkest */
  adminQueue: number | null;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [allArchive, setAllArchive] = useState(false);
  const card = (p: Proposal, actions?: (ctx: ProposalContext) => ReactNode) => (
    <ProposalCard key={p.id} p={p} teams={teams} settings={settings} myTeamId={myTeamId} actions={actions} />
  );
  const archive = allArchive ? groups.archive : groups.archive.slice(0, ARCHIVE_SHOWN);
  const nothing = groups.toAnswer.length + groups.open.length + groups.others.length + groups.archive.length === 0;

  return (
    <>
      <NoticeBar notice={notice} />
      {adminQueue !== null && adminQueue > 0 && (
        <p className="mb-4 rounded-xl border border-gold/60 bg-gold/10 px-3.5 py-3 text-sm">
          <span className="font-semibold">{adminQueue === 1 ? "Una proposta aspetta" : `${adminQueue} proposte aspettano`} un admin.</span>{" "}
          <Link href="/admin/scambio#proposte" className="font-semibold text-brand-blue underline">
            Vai alla coda in Admin → Scambio
          </Link>
        </p>
      )}
      {!myTeamId && adminQueue === null ? (
        <Empty title="Serve una squadra" icon="user">
          Per proporre scambi e rispondere serve un account collegato a una squadra: chiedi a un admin. Il simulatore resta a disposizione.
        </Empty>
      ) : nothing ? (
        <Empty title="Nessuna proposta" icon="swap">
          Prepara uno scambio nel{" "}
          <Link href="/scambio" className="font-semibold text-brand-blue underline">
            simulatore
          </Link>{" "}
          e proponilo: qui vedi le risposte e lo stato.
        </Empty>
      ) : (
        <div className="space-y-3">
          {groups.toAnswer.length > 0 && (
            <section aria-label="Da rispondere" className="space-y-3">
              <GroupTitle icon="clock" count={groups.toAnswer.length}>
                Da rispondere
              </GroupTitle>
              {groups.toAnswer.map((p) => card(p, (ctx) => <AnswerActions p={p} ctx={ctx} market={market} notify={setNotice} />))}
            </section>
          )}
          {groups.open.length > 0 && (
            <section aria-label="In corso" className="space-y-3">
              <GroupTitle icon="swap" count={groups.open.length}>
                In corso
              </GroupTitle>
              {groups.open.map((p) => card(p, p.proposerTeamId === myTeamId ? () => <OwnerActions p={p} notify={setNotice} /> : undefined))}
            </section>
          )}
          {groups.others.length > 0 && (
            <section aria-label="Altre squadre" className="space-y-3">
              <GroupTitle icon="badge" count={groups.others.length}>
                Tra altre squadre
              </GroupTitle>
              {groups.others.map((p) => card(p))}
            </section>
          )}
          {groups.archive.length > 0 && (
            <section aria-label="Archivio" className="space-y-3">
              <GroupTitle icon="ledger" count={groups.archive.length}>
                Archivio
              </GroupTitle>
              {archive.map((p) => card(p))}
              {archive.length < groups.archive.length && (
                <Button variant="secondary" onClick={() => setAllArchive(true)}>
                  Mostra tutte ({groups.archive.length})
                </Button>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** Accetta, rifiuta (con nota facoltativa) o riparti dalla proposta con una controproposta. */
function AnswerActions({ p, ctx, market, notify }: { p: Proposal; ctx: ProposalContext; market: boolean | null; notify: (n: Notice) => void }) {
  const { pending, run } = useRun(notify);
  const { asking, ask, cancel } = useConfirm();
  const [note, setNote] = useState("");
  if (market !== true) return <p className="text-sm text-muted">Mercato chiuso: si risponde quando un admin lo riapre.</p>;
  const blocked = ctx.stale.length > 0 || ctx.ev.errors.length > 0;

  if (asking === "accept") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm font-medium sm:mr-auto">Confermi? Accetti lo scambio così com&apos;è: se accettano tutte, lo esegue un admin.</span>
        <Button variant="secondary" onClick={cancel} disabled={pending}>
          Annulla
        </Button>
        <Button pending={pending} icon="check" onClick={() => run(() => answerProposal({ id: p.id, version: p.version, answer: "accept", note: "" }), cancel)}>
          Sì, accetto
        </Button>
      </div>
    );
  }
  if (asking === "reject") {
    return (
      <div className="space-y-3">
        <Field label="Nota per chi ha proposto" htmlFor={`note-${p.id}`} hint="Facoltativa.">
          <textarea id={`note-${p.id}`} className={inputClass} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={cancel} disabled={pending}>
            Annulla
          </Button>
          <Button variant="danger" pending={pending} icon="x" onClick={() => run(() => answerProposal({ id: p.id, version: p.version, answer: "reject", note }), cancel)}>
            Rifiuta
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {blocked && <p className="text-sm text-muted">Così com&apos;è non si può accettare: puoi rifiutarla o controproporre.</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button icon="check" disabled={blocked} onClick={() => ask("accept")}>
          Accetta
        </Button>
        <Button variant="secondary" icon="x" onClick={() => ask("reject")}>
          Rifiuta
        </Button>
        <Link
          href={`/scambio?controproposta=${p.id}`}
          className="font-display inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-lg font-extrabold tracking-wide text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          Rifiuta e controproponi
        </Link>
      </div>
    </div>
  );
}

/** Chi ha proposto: ritira la proposta o la rifà (la vecchia si ritira all'invio della nuova). */
function OwnerActions({ p, notify }: { p: Proposal; notify: (n: Notice) => void }) {
  const { pending, run } = useRun(notify);
  const { asking, ask, cancel } = useConfirm();
  if (asking === "withdraw") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm font-medium sm:mr-auto">Ritiri la proposta? Le altre squadre non potranno più accettarla.</span>
        <Button variant="secondary" onClick={cancel} disabled={pending}>
          Annulla
        </Button>
        <Button variant="danger" pending={pending} onClick={() => run(() => withdrawProposal({ id: p.id, version: p.version }), cancel)}>
          Sì, ritira
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link
        href={`/scambio?controproposta=${p.id}`}
        className="font-display inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 text-lg font-extrabold tracking-wide transition-colors hover:border-brand-blue hover:text-brand-blue"
      >
        Modifica e rimanda
      </Link>
      <Button variant="ghost" onClick={() => ask("withdraw")}>
        Ritira
      </Button>
    </div>
  );
}
