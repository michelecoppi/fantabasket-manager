-- Pick con proprietario incerto: si importano come "da confermare" e si correggono più avanti.
alter table draft_picks alter column current_team_id drop not null;
alter table draft_picks add column to_confirm boolean not null default false;
comment on column draft_picks.current_team_id is 'null = proprietario sconosciuto (ceduta senza destinatario noto)';
