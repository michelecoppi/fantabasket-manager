// Prova del bot Telegram (Fase 7.5), solo in locale. Non tocca il database.
//   npx tsx --env-file=.env.local scripts/telegram-test.ts            → con TELEGRAM_CHAT_ID: manda al canale un annuncio di esempio
//                                                                      senza: elenca le chat che il bot ha visto, per trovare l'id
//   npx tsx --env-file=.env.local scripts/telegram-test.ts --dry-run  → stampa l'annuncio di esempio senza mandarlo
// Configurazione in docs/DEPLOY.md («Bot Telegram»).
import { sendTelegram, telegramConfig } from "../src/lib/telegram";
import { announcementText, parseAnnouncements } from "../src/lib/trade-announce";

const SAMPLE = parseAnnouncements([
  {
    id: Math.floor(Math.random() * 1000),
    created_at: new Date().toISOString(),
    cap_override_reason: null,
    teams: [
      { id: "a", name: "Squadra di prova A", season_trades: 3 },
      { id: "b", name: "Squadra di prova B", season_trades: 1 },
    ],
    moves: [
      { kind: "contract", id: 1, from: "a", to: "b", name: "Giocatore Costoso", pos: "A", salary: 24 },
      { kind: "contract", id: 2, from: "b", to: "a", name: "Giocatore Economico", pos: "G", salary: 6.5, slot: "reserve" },
      { kind: "pick", id: 3, from: "b", to: "a", year: 2027, round: 2, original_team: "Squadra di prova B" },
      { kind: "talent", id: 4, from: "a", to: "b", label: "Talento di Prova", draft_year: 2026, entry_credits: 3.5, player_id: 1, nba_team: "TST" },
    ],
  },
])[0];

async function main() {
  const text = `🧪 <b>Messaggio di prova</b>, ignoratelo.\n\n${announcementText(SAMPLE, process.env.NEXT_PUBLIC_SITE_URL)}`;
  if (process.argv.includes("--dry-run")) {
    console.log(text);
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Manca TELEGRAM_BOT_TOKEN in .env.local (lo dà @BotFather con /newbot).");
  const cfg = telegramConfig();
  if (!cfg) {
    // Senza chat: le chat in cui il bot ha ricevuto qualcosa (aggiungilo al canale come admin e scrivi un messaggio).
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const body = (await res.json()) as { ok: boolean; description?: string; result?: Record<string, { chat?: { id: number; title?: string; type: string } }>[] };
    if (!body.ok) throw new Error(`Telegram: ${body.description ?? res.status}`);
    const chats = new Map<number, string>();
    for (const u of body.result ?? []) {
      for (const v of Object.values(u)) if (v?.chat) chats.set(v.chat.id, `${v.chat.title ?? "(senza titolo)"} · ${v.chat.type}`);
    }
    if (!chats.size) console.log("Nessuna chat vista: aggiungi il bot al canale come amministratore, pubblica un messaggio e rilancia.");
    for (const [id, what] of chats) console.log(`${id}\t${what}`);
    console.log("Metti l'id del canale in TELEGRAM_CHAT_ID e rilancia per il messaggio di prova.");
    return;
  }
  const res = await sendTelegram(cfg, text);
  if (!res.ok) throw new Error(res.error);
  console.log("Messaggio di prova inviato.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
