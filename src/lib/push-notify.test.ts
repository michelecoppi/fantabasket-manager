import { describe, expect, it } from "vitest";
import { parsePushClaim, pushMessages, type PushEvent, type PushSub } from "./push-notify";

const NOW = Date.parse("2026-11-05T10:00:00Z");
const A = "team-a";
const B = "team-b";
const C = "team-c";
const TEAMS = [
  { id: A, name: "Bol Bollerz" },
  { id: B, name: "Spaccinos" },
];

const event = (over: Partial<PushEvent> = {}): PushEvent => ({
  id: 1,
  kind: "sent",
  note: null,
  proposalId: 7,
  actor: "u-a",
  teamId: A,
  proposer: A,
  counter: false,
  expiresAt: "2026-11-05T13:20:00Z",
  completes: false,
  teams: TEAMS,
  ...over,
});
const sub = (over: Partial<PushSub> & { userId: string }): PushSub => ({ teamId: null, admin: false, endpoint: `https://push.example/${over.userId}`, p256dh: "k", auth: "a", ...over });

const SUBS: PushSub[] = [
  sub({ userId: "u-a", teamId: A }),
  sub({ userId: "u-b", teamId: B }),
  sub({ userId: "u-c", teamId: C }),
  sub({ userId: "u-admin", teamId: null, admin: true }),
];
const to = (msgs: ReturnType<typeof pushMessages>) => msgs.map((m) => m.sub.userId).sort();

describe("parsePushClaim", () => {
  it("legge eventi e iscrizioni e scarta quelli incompleti", () => {
    const parsed = parsePushClaim({
      events: [
        { id: 1, kind: "sent", note: null, proposal_id: 7, actor: "u-a", team_id: A, proposer: A, counter: true, expires_at: "2026-11-05T13:00:00Z", completes: false, teams: [{ id: A, name: "Bol" }, { id: B, name: "Spa" }] },
        { id: 2, kind: "dunkest_done", proposal_id: 7, proposer: A, teams: [{ id: A }, { id: B }] },
        { id: 3, kind: "sent", proposal_id: 7, proposer: A, teams: [{ id: A }] },
        { kind: "sent", proposal_id: 7, proposer: A, teams: [{ id: A }, { id: B }] },
      ],
      subs: [
        { user_id: "u-a", team_id: A, admin: false, endpoint: "https://x/1", p256dh: "k", auth: "a" },
        { user_id: "u-b", endpoint: "https://x/2", p256dh: "k" },
      ],
    });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({ id: 1, kind: "sent", counter: true, proposer: A, actor: "u-a" });
    expect(parsed.subs).toEqual([{ userId: "u-a", teamId: A, admin: false, endpoint: "https://x/1", p256dh: "k", auth: "a" }]);
  });

  it("regge una risposta vuota o sbagliata", () => {
    expect(parsePushClaim(null)).toEqual({ events: [], subs: [] });
    expect(parsePushClaim({ events: "no", subs: 3 })).toEqual({ events: [], subs: [] });
  });
});

describe("nuova proposta", () => {
  it("avvisa le altre squadre, non chi ha proposto, con il tempo che resta", () => {
    const msgs = pushMessages(event({ expiresAt: "2026-11-05T12:20:00Z" }), SUBS, NOW);
    expect(to(msgs)).toEqual(["u-b"]);
    expect(msgs[0].payload).toEqual({
      title: "Nuova proposta di scambio",
      body: "Bol Bollerz ti propone uno scambio. Hai ancora 2 h 20 min per rispondere.",
      url: "/scambio?vista=proposte",
      tag: "trade-7",
    });
  });

  it("una controproposta lo dice", () => {
    const [m] = pushMessages(event({ counter: true }), SUBS, NOW);
    expect(m.payload.title).toBe("Controproposta di scambio");
    expect(m.payload.body).toContain("controproposta");
  });

  it("a tre squadre avvisa entrambe le controparti", () => {
    const e = event({ teams: [...TEAMS, { id: C, name: "Tigri" }] });
    expect(to(pushMessages(e, SUBS, NOW))).toEqual(["u-b", "u-c"]);
  });

  it("già scaduta: niente avviso", () => {
    expect(pushMessages(event({ expiresAt: "2026-11-05T09:00:00Z" }), SUBS, NOW)).toEqual([]);
  });

  it("non manda niente a chi ha fatto l'azione, anche se ha un secondo dispositivo di un'altra squadra", () => {
    const subs = [sub({ userId: "u-b", teamId: B }), sub({ userId: "u-b", teamId: B, endpoint: "https://push.example/u-b-2" })];
    expect(pushMessages(event({ actor: "u-b" }), subs, NOW)).toEqual([]);
  });

  it("un dispositivo di una squadra non coinvolta non riceve nulla", () => {
    expect(to(pushMessages(event(), [sub({ userId: "u-c", teamId: C }), sub({ userId: "u-admin", admin: true })], NOW))).toEqual([]);
  });
});

describe("accettata", () => {
  const accepted = (over: Partial<PushEvent> = {}) => event({ kind: "accepted", actor: "u-b", teamId: B, ...over });

  it("accettazione parziale: lo sa solo chi ha proposto", () => {
    const msgs = pushMessages(accepted(), SUBS, NOW);
    expect(to(msgs)).toEqual(["u-a"]);
    expect(msgs[0].payload).toMatchObject({ title: "Spaccinos ha accettato", body: "Mancano le risposte delle altre squadre." });
  });

  it("l'ultima accettazione avvisa anche gli admin, con la pagina di approvazione", () => {
    const msgs = pushMessages(accepted({ completes: true }), SUBS, NOW);
    expect(to(msgs)).toEqual(["u-a", "u-admin"]);
    const admin = msgs.find((m) => m.sub.userId === "u-admin")!;
    expect(admin.payload).toMatchObject({ title: "Proposta da approvare", url: "/admin/scambio", body: "Bol Bollerz e Spaccinos hanno accettato uno scambio." });
    expect(msgs.find((m) => m.sub.userId === "u-a")!.payload.body).toContain("la approva un admin");
  });

  it("un admin che è anche la squadra che ha proposto riceve un solo avviso, quello da admin", () => {
    const subs = [sub({ userId: "u-a", teamId: A, admin: true })];
    const msgs = pushMessages(accepted({ completes: true, actor: "u-b" }), subs, NOW);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].payload.title).toBe("Proposta da approvare");
  });
});

describe("rifiutata", () => {
  it("avvisa chi ha proposto, con la nota", () => {
    const [m] = pushMessages(event({ kind: "rejected", actor: "u-b", teamId: B, note: "Troppo poco" }), SUBS, NOW);
    expect(m.sub.userId).toBe("u-a");
    expect(m.payload).toMatchObject({ title: "Spaccinos ha rifiutato", body: "La proposta è chiusa: «Troppo poco»" });
  });

  it("senza nota il testo è breve", () => {
    const [m] = pushMessages(event({ kind: "rejected", actor: "u-b", teamId: B }), SUBS, NOW);
    expect(m.payload.body).toBe("La proposta è chiusa.");
  });

  it("il rifiuto di una controproposta non si notifica: arriva l'avviso della nuova proposta", () => {
    expect(pushMessages(event({ kind: "rejected", actor: "u-b", teamId: B, note: "Controproposta" }), SUBS, NOW)).toEqual([]);
  });
});

describe("ritirata", () => {
  it("dal proponente: lo sanno le altre squadre", () => {
    const msgs = pushMessages(event({ kind: "withdrawn" }), SUBS, NOW);
    expect(to(msgs)).toEqual(["u-b"]);
    expect(msgs[0].payload.body).toBe("Bol Bollerz ha ritirato la proposta di scambio.");
  });

  it("sostituita da una nuova proposta: niente, arriva l'avviso della nuova", () => {
    expect(pushMessages(event({ kind: "withdrawn", note: "Sostituita da una nuova proposta" }), SUBS, NOW)).toEqual([]);
  });

  it("mercato chiuso: lo sanno tutte le squadre della proposta", () => {
    const msgs = pushMessages(event({ kind: "withdrawn", actor: "u-admin", teamId: null, note: "Mercato chiuso" }), SUBS, NOW);
    expect(to(msgs)).toEqual(["u-a", "u-b"]);
    expect(msgs[0].payload.body).toContain("mercato");
  });
});

describe("annullata, approvata, respinta", () => {
  it("scambio altrove: dice che un giocatore o una pick sono già stati scambiati", () => {
    const [m] = pushMessages(event({ kind: "superseded", actor: "u-admin", teamId: null, note: "Scambio n. 12" }), SUBS, NOW);
    expect(m.payload).toMatchObject({ title: "Proposta annullata" });
    expect(m.payload.body).toContain("già stato scambiato");
  });

  it("rimandata dall'admin: con la nota, se c'è", () => {
    const withNote = pushMessages(event({ kind: "superseded", actor: "u-admin", teamId: null, note: "Rose cambiate" }), SUBS, NOW);
    expect(withNote[0].payload.body).toBe("Un admin l'ha rimandata alle squadre: «Rose cambiate»");
    const plain = pushMessages(event({ kind: "superseded", actor: "u-admin", teamId: null, note: "Rimandata alle squadre" }), SUBS, NOW);
    expect(plain[0].payload.body).toBe("Un admin l'ha rimandata alle squadre: va rifatta.");
  });

  it("approvata: tutte le squadre, tranne l'admin che l'ha approvata, con la pagina dello storico", () => {
    const subs = [...SUBS, sub({ userId: "u-a2", teamId: A, admin: true })];
    const msgs = pushMessages(event({ kind: "approved", actor: "u-a2", teamId: null }), subs, NOW);
    expect(to(msgs)).toEqual(["u-a", "u-b"]);
    expect(msgs[0].payload).toMatchObject({ title: "Scambio approvato", url: "/storico-scambi" });
  });

  it("respinta: con il motivo", () => {
    const [m] = pushMessages(event({ kind: "declined", actor: "u-admin", teamId: null, note: "Sfora il cap" }), SUBS, NOW);
    expect(m.payload).toMatchObject({ title: "Proposta respinta", body: "Un admin l'ha respinta: «Sfora il cap»" });
  });

  it("accorcia le note lunghe", () => {
    const [m] = pushMessages(event({ kind: "declined", actor: "u-admin", teamId: null, note: "x".repeat(400) }), SUBS, NOW);
    expect(m.payload.body.length).toBeLessThanOrEqual(140);
    expect(m.payload.body.endsWith("…")).toBe(true);
  });
});
