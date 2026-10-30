// Etichette, spiegazioni, icone e tono dei premi della giornata: li usano la bacheca (`components/awards.tsx`) e la card da condividere.
import type { IconName } from "@/components/icons";
import type { AwardKind } from "./awards";

export const AWARD_META: Record<AwardKind, { label: string; hint: string; icon: IconName; tone: "gold" | "blue" | "red" }> = {
  mvp: { label: "MVP", hint: "più punti tra tutti gli schierati", icon: "crown", tone: "gold" },
  captain_best: { label: "Capitano d'oro", hint: "il capitano con più punti", icon: "star", tone: "gold" },
  sixth_man: { label: "Sesto uomo", hint: "il sesto uomo con più punti", icon: "medal", tone: "blue" },
  bench: { label: "Colpo dalla panchina", hint: "il panchinaro con più punti", icon: "bolt", tone: "blue" },
  captain_worst: { label: "Capitano di latta", hint: "il capitano con meno punti", icon: "trending-down", tone: "red" },
  team_best: { label: "Squadra della giornata", hint: "il punteggio più alto", icon: "trophy", tone: "gold" },
  team_worst: { label: "Cucchiaio di legno", hint: "il punteggio più basso", icon: "mood-sad", tone: "red" },
  blowout: { label: "Goleada", hint: "lo scarto più largo", icon: "flame", tone: "blue" },
  photo_finish: { label: "Al fotofinish", hint: "lo scarto più stretto", icon: "stopwatch", tone: "blue" },
};
