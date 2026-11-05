/**
 * Notifiche push (docs/product/PIANO-NOTIFICHE-PUSH.md): da un evento del registro delle proposte di scambio a «chi riceve cosa».
 * Puro e testato: la presa degli eventi (`push_claim`) e la spedizione stanno in `push.ts`.
 * Le proposte sono private: l'avviso arriva solo alle squadre della proposta e, per l'approvazione, agli admin, e dice solo i nomi
 * delle squadre (mai giocatori o pick: sul telefono bloccato un avviso si legge senza sbloccarlo).
 */
import { timeLeft } from "./trade-proposals";

export type PushEventKind = "sent" | "accepted" | "rejected" | "withdrawn" | "superseded" | "approved" | "declined";

export interface PushEvent {
  id: number;
  kind: PushEventKind;
  note: string | null;
  proposalId: number;
  /** account che ha fatto l'azione: non riceve l'avviso di ciò che ha appena fatto */
  actor: string | null;
  /** squadra che ha fatto l'azione (null per le azioni degli admin e per la chiusura del mercato) */
  teamId: string | null;
  proposer: string;
  /** la proposta nasce da una controproposta */
  counter: boolean;
  expiresAt: string | null;
  /** accettazione che ha portato la proposta alla coda degli admin */
  completes: boolean;
  teams: { id: string; name: string }[];
}

/** Un dispositivo iscritto, con la squadra e il ruolo dell'account. */
export interface PushSub {
  userId: string;
  teamId: string | null;
  admin: boolean;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Quello che arriva al service worker (`public/sw.js`): titolo, testo, pagina da aprire al tocco, tag per sostituire l'avviso vecchio. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushMessage {
  sub: PushSub;
  payload: PushPayload;
}

/** Note scritte dalle RPC `trade_*` (migrazione 20261029180000): servono a non dire due volte la stessa cosa. */
const NOTE_COUNTER = "Controproposta";
const NOTE_REPLACED = "Sostituita da una nuova proposta";
/** Nota di `trade_apply` sulle proposte che muovono un giocatore o una pick appena scambiati: «Scambio n. 12». */
const NOTE_SWAPPED = /^Scambio n\./;

const BODY_MAX = 140;
const clip = (s: string) => (s.length > BODY_MAX ? `${s.slice(0, BODY_MAX - 1)}…` : s);

const OWNER_URL = "/scambio?vista=proposte";
const ADMIN_URL = "/admin/scambio";
const HISTORY_URL = "/storico-scambi";

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const str = (x: unknown) => (typeof x === "string" && x ? x : null);
const KINDS = new Set<string>(["sent", "accepted", "rejected", "withdrawn", "superseded", "approved", "declined"]);

/** Legge la risposta di `push_claim`; scarta ciò che non è un evento o un'iscrizione completi. */
export function parsePushClaim(data: unknown): { events: PushEvent[]; subs: PushSub[] } {
  const root = obj(data);
  const events = (Array.isArray(root.events) ? root.events : []).flatMap((raw): PushEvent[] => {
    const r = obj(raw);
    const id = Number(r.id);
    const proposalId = Number(r.proposal_id);
    const proposer = str(r.proposer);
    const teams = (Array.isArray(r.teams) ? r.teams : []).flatMap((x) => {
      const t = obj(x);
      const tid = str(t.id);
      return tid ? [{ id: tid, name: str(t.name) ?? "?" }] : [];
    });
    if (!Number.isFinite(id) || !Number.isFinite(proposalId) || !proposer || teams.length < 2 || typeof r.kind !== "string" || !KINDS.has(r.kind)) return [];
    return [{
      id,
      kind: r.kind as PushEventKind,
      note: str(r.note),
      proposalId,
      actor: str(r.actor),
      teamId: str(r.team_id),
      proposer,
      counter: r.counter === true,
      expiresAt: str(r.expires_at),
      completes: r.completes === true,
      teams,
    }];
  });
  const subs = (Array.isArray(root.subs) ? root.subs : []).flatMap((raw): PushSub[] => {
    const r = obj(raw);
    const userId = str(r.user_id);
    const endpoint = str(r.endpoint);
    const p256dh = str(r.p256dh);
    const auth = str(r.auth);
    return userId && endpoint && p256dh && auth ? [{ userId, teamId: str(r.team_id), admin: r.admin === true, endpoint, p256dh, auth }] : [];
  });
  return { events, subs };
}

/** «A», «A e B», «A, B e C». */
function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

interface Plan {
  title: string;
  body: string;
  /** squadre che ricevono l'avviso */
  teamIds: string[];
  url: string;
  /** avviso agli admin (di solito diverso da quello delle squadre) */
  admins?: { title: string; body: string };
}

/** Testo e destinatari di un evento; null se l'evento non va notificato. */
function plan(e: PushEvent, now: number): Plan | null {
  const name = (id: string | null) => e.teams.find((t) => t.id === id)?.name ?? "Un'altra squadra";
  const all = e.teams.map((t) => t.id);
  const others = (id: string | null) => all.filter((t) => t !== id);

  switch (e.kind) {
    case "sent": {
      // Già scaduta (avviso arrivato tardi): non c'è più niente a cui rispondere.
      const left = e.expiresAt ? Date.parse(e.expiresAt) - now : Number.POSITIVE_INFINITY;
      if (left <= 0) return null;
      const wait = Number.isFinite(left) ? ` Hai ancora ${timeLeft(left)} per rispondere.` : "";
      return {
        title: e.counter ? "Controproposta di scambio" : "Nuova proposta di scambio",
        body: clip(e.counter ? `${name(e.proposer)} ha risposto con una controproposta.${wait}` : `${name(e.proposer)} ti propone uno scambio.${wait}`),
        teamIds: others(e.proposer),
        url: OWNER_URL,
      };
    }
    case "accepted":
      return {
        title: `${name(e.teamId)} ha accettato`,
        body: e.completes ? "Tutte le squadre hanno accettato: ora la approva un admin." : "Mancano le risposte delle altre squadre.",
        teamIds: [e.proposer],
        url: OWNER_URL,
        admins: e.completes ? { title: "Proposta da approvare", body: clip(`${joinNames(e.teams.map((t) => t.name))} hanno accettato uno scambio.`) } : undefined,
      };
    case "rejected":
      // Una controproposta chiude la vecchia proposta e ne apre una nuova: l'avviso è quello della nuova.
      if (e.note === NOTE_COUNTER) return null;
      return { title: `${name(e.teamId)} ha rifiutato`, body: clip(e.note ? `La proposta è chiusa: «${e.note}»` : "La proposta è chiusa."), teamIds: [e.proposer], url: OWNER_URL };
    case "withdrawn":
      if (e.note === NOTE_REPLACED) return null;
      return e.teamId
        ? { title: "Proposta ritirata", body: clip(`${name(e.teamId)} ha ritirato la proposta di scambio.`), teamIds: others(e.teamId), url: OWNER_URL }
        : { title: "Proposta ritirata", body: "Il mercato degli scambi è chiuso: la proposta non è più valida.", teamIds: all, url: OWNER_URL };
    case "superseded":
      return {
        title: "Proposta annullata",
        body: e.note && NOTE_SWAPPED.test(e.note)
          ? "Un giocatore o una pick della proposta è già stato scambiato: se serve, rifalla."
          : clip(e.note && e.note !== "Rimandata alle squadre" ? `Un admin l'ha rimandata alle squadre: «${e.note}»` : "Un admin l'ha rimandata alle squadre: va rifatta."),
        teamIds: all,
        url: OWNER_URL,
      };
    case "approved":
      return { title: "Scambio approvato", body: clip(`${joinNames(e.teams.map((t) => t.name))}: lo scambio è stato approvato e registrato.`), teamIds: all, url: HISTORY_URL };
    case "declined":
      return { title: "Proposta respinta", body: clip(e.note ? `Un admin l'ha respinta: «${e.note}»` : "Un admin l'ha respinta."), teamIds: all, url: OWNER_URL };
  }
}

/**
 * Gli avvisi di un evento, uno per dispositivo: gli admin prima (il loro avviso, quando c'è, vale più di quello della squadra),
 * poi le squadre; un dispositivo riceve un solo avviso per evento e chi ha fatto l'azione non riceve nulla.
 */
export function pushMessages(e: PushEvent, subs: PushSub[], now: number): PushMessage[] {
  const p = plan(e, now);
  if (!p) return [];
  const tag = `trade-${e.proposalId}`;
  const out: PushMessage[] = [];
  const seen = new Set<string>();
  const add = (sub: PushSub, payload: Omit<PushPayload, "tag">) => {
    if (seen.has(sub.endpoint) || (e.actor && sub.userId === e.actor)) return;
    seen.add(sub.endpoint);
    out.push({ sub, payload: { ...payload, tag } });
  };
  if (p.admins) for (const s of subs) if (s.admin) add(s, { ...p.admins, url: ADMIN_URL });
  for (const s of subs) if (s.teamId && p.teamIds.includes(s.teamId)) add(s, { title: p.title, body: p.body, url: p.url });
  return out;
}
