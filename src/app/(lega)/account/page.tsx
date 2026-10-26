import { TeamCrest } from "@/components/crest";
import { Card, PageTitle, Section } from "@/components/ui";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const [profile, league] = await Promise.all([loadProfile(), loadLeague()]);
  const team = league.teams.find((t) => t.team.id === profile?.team_id)?.team;
  const color = team ? teamColors(league.teams.map((t) => t.team.id)).get(team.id) : undefined;

  return (
    <>
      <PageTitle icon="user" eyebrow="Il tuo account" sub="Scegli una password per entrare con email e password, senza aspettare ogni volta il link via mail.">
        Account
      </PageTitle>

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:items-start">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            {team && <TeamCrest name={team.name} color={color ?? "#555"} size="lg" mine />}
            <div className="min-w-0">
              <div className="font-display truncate text-2xl leading-none font-extrabold">{profile?.display_name}</div>
              <div className="mt-1 truncate text-sm text-muted">{team?.name ?? "Nessuna squadra"}</div>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="eyebrow text-muted">Email</dt>
              <dd className="mt-0.5 break-all">{profile?.email}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted">Ruolo</dt>
              <dd className="mt-0.5">{profile?.role === "admin" ? "Admin" : "Sola lettura"}</dd>
            </div>
          </dl>
        </Card>

        <Section title="Password" icon="lock" id="password">
          <Card className="max-w-xl p-5 sm:p-6">
            <PasswordForm />
          </Card>
        </Section>
      </div>
    </>
  );
}
