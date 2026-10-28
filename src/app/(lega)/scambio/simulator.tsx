"use client";

import { TradeMachine, type SimTeam } from "@/components/trade-parts";
import type { LeagueSettings } from "@/lib/cap";

export type { SimTeam };

export function TradeSimulator({ teams, settings, myTeamId }: { teams: SimTeam[]; settings: LeagueSettings; myTeamId?: string | null }) {
  if (teams.length < 2) return <p className="text-sm text-muted">Servono almeno due squadre.</p>;
  return (
    <>
      <TradeMachine teams={teams} settings={settings} myTeamId={myTeamId} />
      <p className="mt-4 text-xs text-muted">
        Assunzioni: se non scegli altro, i giocatori arrivano nello stesso slot (titolare/riserva) che avevano; se una squadra è già sopra il cap, lo scambio è
        accettabile solo se non aumenta il suo monte ingaggi. Un moderatore può autorizzare eccezioni (R-57). Al massimo {settings.tradeMaxTeams} squadre per
        scambio.
      </p>
      <p className="mt-2 text-xs font-semibold text-warning">
        Ogni scambio va fatto anche su Dunkest, titolari e riserve compresi: questa app non modifica le rose Dunkest.
      </p>
    </>
  );
}
