import { describe, expect, it } from "vitest";
import { parseSlotSwapAnnouncements, slotSwapAlertText, slotSwapText, SWAP_CLOSINGS, SWAP_HEADLINES, SWAP_LINES } from "./slot-swap-announce";

const claim = [
  {
    id: 4,
    team: "Bol <Bollerz>",
    team_id: "t1",
    season_swaps: 2,
    items: [
      { slot: "reserve", name: "Jalen Green", pos: "G", salary: 12.5 },
      { slot: "starter", name: "Josh Giddey", pos: "G", salary: 9 },
      { slot: "starter", name: "", pos: "A", salary: 1 },
    ],
  },
  { id: 5, team: "Vuota", items: [] },
  "rotto",
];

describe("annuncio dei cambi titolari/riserve", () => {
  it("legge la presa e scarta ciò che non si può annunciare", () => {
    const list = parseSlotSwapAnnouncements(claim);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 4,
      team: "Bol <Bollerz>",
      teamId: "t1",
      seasonSwaps: 2,
      players: [
        { name: "Jalen Green", pos: "G", salary: 12.5, slot: "reserve" },
        { name: "Josh Giddey", pos: "G", salary: 9, slot: "starter" },
      ],
    });
    expect(parseSlotSwapAnnouncements(null)).toEqual([]);
  });

  it("dice chi sale e chi scende, con HTML sicuro e il link alla squadra", () => {
    const [s] = parseSlotSwapAnnouncements(claim);
    const text = slotSwapText(s, "https://lega.example/");
    expect(text).toContain("<b>Bol &lt;Bollerz&gt;</b>");
    expect(text).toContain("⬆️ <b>Salgono titolari</b>\n• G · Josh Giddey (9)");
    expect(text).toContain("⬇️ <b>Passano alle riserve</b>\n• G · Jalen Green (12,5)");
    expect(text).toContain("È il 2° cambio della stagione");
    expect(text).toContain('<a href="https://lega.example/squadre/t1">');
    expect(SWAP_HEADLINES.some((h) => text.startsWith(`<b>${h}</b>`))).toBe(true);
    expect(SWAP_CLOSINGS.some((c) => text.includes(c))).toBe(true);
    expect(SWAP_LINES.some((l) => text.includes(l.replace("{team}", "<b>Bol &lt;Bollerz&gt;</b>")))).toBe(true);
    // stesso cambio, stesse frasi
    expect(slotSwapText(s, null)).toBe(slotSwapText(s, undefined));
    expect(slotSwapText(s, null)).not.toContain("<a ");
  });

  it("avviso agli admin: chi sale, chi passa alle riserve, la luxury tax e il link alla coda", () => {
    const text = slotSwapAlertText(
      "Bol & Co",
      [
        { name: "Josh Giddey", pos: "G", salary: 9, slot: "starter" },
        { name: "Jalen Green", pos: "G", salary: 12.5, slot: "reserve" },
      ],
      ["Dopo il cambio il monte ingaggi supera il cap di 3: luxury tax di 0.75 € (R-10, R-12)."],
      "https://lega.example",
    );
    expect(text).toBe(
      [
        "🔔 <b>Richiesta di cambio titolari/riserve</b>",
        "<b>Bol &amp; Co</b>",
        "",
        "⬆️ <b>Salgono titolari</b>",
        "• G · Josh Giddey (9)",
        "⬇️ <b>Passano alle riserve</b>",
        "• G · Jalen Green (12,5)",
        "",
        "⚠️ Dopo il cambio il monte ingaggi supera il cap di 3: luxury tax di 0.75 € (R-10, R-12).",
        "",
        "Fallo su Dunkest, poi approvalo nell'app.",
        '<a href="https://lega.example/admin/rose#cambi">Cambi richiesti</a>',
      ].join("\n"),
    );
  });
});
