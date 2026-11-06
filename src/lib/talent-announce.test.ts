import { describe, expect, it } from "vitest";
import {
  talentPromotionText,
  TALENT_CLOSINGS,
  TALENT_HEADLINES_RESERVE,
  TALENT_HEADLINES_STARTER,
  TALENT_LINES,
  type AnnouncedTalentPromotion,
} from "./talent-announce";

const sampleStarter: AnnouncedTalentPromotion = {
  talentId: 10,
  teamId: "team-spaccinos",
  team: "Chicago <Spaccinos>",
  playerName: "Cooper Flagg",
  pos: "A",
  nbaTeam: "DAL",
  slot: "starter",
  salary: 8.5,
  years: 2,
  teamOption: false,
  draftYear: 2026,
};

const sampleReserve: AnnouncedTalentPromotion = {
  talentId: 12,
  teamId: "team-bollerz",
  team: "Bol Bollerz",
  playerName: "Dylan Harper",
  pos: "G",
  nbaTeam: "SAS",
  slot: "reserve",
  salary: 5,
  years: 1,
  teamOption: true,
  draftYear: null,
};

describe("annuncio promozione rookie dalle promesse", () => {
  it("formatta correttamente una promozione in prima squadra (titolare)", () => {
    const text = talentPromotionText(sampleStarter, "https://lega.example/");

    expect(text).toContain("<b>Chicago &lt;Spaccinos&gt;</b>");
    expect(text).toContain("• A · <b>Cooper Flagg</b> (DAL)");
    expect(text).toContain("Contratto rookie · 2 anni · 8,5 crediti · Draft 2026");
    expect(text).toContain("Destinazione: <b>Titolare (prima squadra)</b>");
    expect(text).toContain("⚠️ Da inserire anche nella formazione su Dunkest!");
    expect(text).toContain('<a href="https://lega.example/squadre/team-spaccinos">La rosa di Chicago &lt;Spaccinos&gt;</a>');

    expect(TALENT_HEADLINES_STARTER.some((h) => text.startsWith(`<b>${h}</b>`))).toBe(true);
    expect(TALENT_LINES.some((l) => text.includes(l.replace("{team}", "<b>Chicago &lt;Spaccinos&gt;</b>")))).toBe(true);
    expect(TALENT_CLOSINGS.some((c) => text.includes(c))).toBe(true);

    // Stesso id -> stesso testo
    expect(talentPromotionText(sampleStarter, "https://lega.example/")).toBe(text);
  });

  it("formatta correttamente un inserimento nella squadra riserve con team option", () => {
    const text = talentPromotionText(sampleReserve, null);

    expect(text).toContain("<b>Bol Bollerz</b>");
    expect(text).toContain("• G · <b>Dylan Harper</b> (SAS)");
    expect(text).toContain("Contratto rookie · 1+1 anni (team option) · 5 crediti");
    expect(text).toContain("Destinazione: <b>Squadra riserve</b>");
    // Niente avviso Dunkest per le riserve
    expect(text).not.toContain("Da inserire anche nella formazione su Dunkest!");
    // Senza siteUrl non c'è link
    expect(text).not.toContain("<a ");

    expect(TALENT_HEADLINES_RESERVE.some((h) => text.startsWith(`<b>${h}</b>`))).toBe(true);
    expect(TALENT_LINES.some((l) => text.includes(l.replace("{team}", "<b>Bol Bollerz</b>")))).toBe(true);
    expect(TALENT_CLOSINGS.some((c) => text.includes(c))).toBe(true);
  });

  it("gestisce durate nulle e mezza stagione", () => {
    const p1: AnnouncedTalentPromotion = { ...sampleReserve, years: null, teamOption: false };
    expect(talentPromotionText(p1)).toContain("durata da fissare");

    const p2: AnnouncedTalentPromotion = { ...sampleReserve, years: 0.5, teamOption: false };
    expect(talentPromotionText(p2)).toContain("½ stagione");

    const p3: AnnouncedTalentPromotion = { ...sampleReserve, years: 1, teamOption: false };
    expect(talentPromotionText(p3)).toContain("1 anno");
  });
});
