#!/usr/bin/env bash
# Test di concorrenza delle RPC admin (P1-06): più sessioni psql vere, in parallelo, contro un Postgres con migrazioni e seed.
# SOLO su un database usa e getta (CI o Docker, come rls.sql): crea e poi toglie righe con id 91xxxx, ma incrementa
# `teams.roster_rev`, scrive `audit_log` e per un attimo sposta la stagione corrente. Mai sul progetto reale.
#
#   bash supabase/tests/concurrency.sh      # con PGHOST/PGUSER/PGPASSWORD/PGDATABASE come per rls.sql
#
# Cosa verifica:
#  1. due firme con la stessa revisione di rosa (l'ultimo slot): la seconda aspetta il lock e risponde CONFLICT;
#  2. firma contro chiusura di stagione, nei due ordini: la chiusura aspetta le scritture in corso; una firma che arriva a
#     chiusura in corso non finisce nella stagione chiusa;
#  3. scambi in versi opposti e taglio contro scambio: nessun deadlock (40P01), il perdente risponde CONFLICT;
#  4. proposte di scambio (Fase 7.2): due approvazioni con gli stessi giocatori e approvazione contro taglio, stesso esito;
#     la proposta perdente risulta superata.
set -uo pipefail

export PGOPTIONS="${PGOPTIONS:-} -c lock_timeout=20s"
psqlq() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

ADMIN=00000000-0000-4000-8000-0000000c0a01
TMP=$(mktemp -d)
FAILS=0
fail() { echo "CONCORRENZA: $*" >&2; FAILS=$((FAILS + 1)); }
ok() { echo "ok - $*"; }

# L'ordine per id è quello dei lock nelle RPC: A < B.
read -r TA TB < <(psqlq -F ' ' -c "select a.id, b.id from teams a, teams b where a.id < b.id order by a.id, b.id limit 1")
SEASON=$(psqlq -c "select id from seasons where is_current")
[ -n "$TA" ] && [ -n "$SEASON" ] || { echo "servono migrazioni, seed e almeno 2 squadre" >&2; exit 2; }

cleanup() {
  psqlq -c "
    delete from audit_log where user_id = '$ADMIN';
    delete from trade_proposals where id between 910001 and 910099;
    delete from trades where approved_by = 'conc-test';
    delete from contracts where player_id between 910001 and 910099;
    delete from cuts where player_id between 910001 and 910099;
    delete from players where id between 910001 and 910099;
    delete from profiles where id = '$ADMIN';
    delete from auth.users where id = '$ADMIN';
    delete from seasons where year = 2999;
    update seasons set is_current = true where id = $SEASON and not exists (select 1 from seasons where is_current);
  " >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

psqlq -c "
  insert into auth.users (id) values ('$ADMIN');
  insert into profiles (id, display_name, role) values ('$ADMIN', 'Conc admin', 'admin');
  insert into players (id, first_name, last_name, pos, nba_team)
    select 910000 + n, 'Conc', 'P' || n, 'G', 'TST' from generate_series(1, 6) n;
" >/dev/null

# Ripristina i contratti di prova: 910011 in A, 910012 in B.
reset() {
  psqlq -c "
    delete from contracts where player_id between 910001 and 910099;
    delete from cuts where player_id between 910001 and 910099;
    insert into contracts (id, season_id, team_id, player_id, slot, years_left, salary) values
      (910011, $SEASON, '$TA', 910005, 'reserve', 1, 1), (910012, $SEASON, '$TB', 910006, 'reserve', 1, 1);
  " >/dev/null
}

AS_ADMIN="select set_config('request.jwt.claims', '{\"role\":\"authenticated\",\"sub\":\"$ADMIN\"}', false), set_config('request.jwt.claim.sub', '$ADMIN', false); set role authenticated;"

rev() { psqlq -c "select roster_rev from teams where id = '$1'"; }
version() { psqlq -c "select version from contracts where id = $1"; }
epoch() { echo "select extract(epoch from clock_timestamp());"; }

# Sessione in background: $1 = file di output, resto = SQL (eseguito come admin, dentro una transazione).
session() {
  local out=$1; shift
  { echo "begin; $AS_ADMIN"; echo "$@"; echo "commit;"; } | psql -X -q -At -v ON_ERROR_STOP=1 >"$out" 2>&1
  echo "exit=$?" >>"$out"
}
sign() { echo "select 'signed:' || public.admin_sign_contract($1, '$2', 'reserve', 1, false, 1, false, null, null, $3);"; }

# ---------- 1. Ultimo slot ----------
reset
R=$(rev "$TA")
session "$TMP/s1" "$(sign 910001 "$TA" "$R")" "select pg_sleep(2);" &
sleep 0.7
session "$TMP/s2" "$(sign 910002 "$TA" "$R")" &
wait
grep -q 'signed:' "$TMP/s1" || fail "1: la prima firma doveva riuscire ($(cat "$TMP/s1"))"
grep -q 'CONFLICT: la rosa è stata modificata' "$TMP/s2" || fail "1: la seconda firma doveva dare CONFLICT sulla rosa ($(cat "$TMP/s2"))"
N=$(psqlq -c "select count(*) from contracts where player_id in (910001, 910002)")
[ "$N" = 1 ] && ok "due firme sulla stessa revisione: ne passa una sola" || fail "1: contratti scritti = $N, atteso 1"

# ---------- 2a. Firma in corso, poi chiusura ----------
reset
R=$(rev "$TA")
session "$TMP/s1" "$(sign 910001 "$TA" "$R")" "$(epoch)" "select pg_sleep(2);" "$(epoch)" &
sleep 0.7
# Stessa apertura di admin_close_season: lock della stagione corrente, poi si chiude e se ne apre una nuova.
{ echo "begin;"; echo "select id from seasons where is_current for update;"; epoch
  echo "update seasons set is_current = false where id = $SEASON; insert into seasons (year, is_current) values (2999, true);"; echo "commit;"; } \
  | psql -X -q -At -v ON_ERROR_STOP=1 >"$TMP/c1" 2>&1 &
wait
S1_END=$(grep -E '^[0-9]+\.[0-9]+$' "$TMP/s1" | tail -1); C_LOCK=$(grep -E '^[0-9]+\.[0-9]+$' "$TMP/c1" | head -1)
awk -v a="$S1_END" -v b="$C_LOCK" 'BEGIN { exit !(b >= a - 0.05) }' \
  && ok "la chiusura aspetta le scritture in corso" || fail "2a: la chiusura ha preso il lock prima della fine della firma ($S1_END vs $C_LOCK)"
grep -q 'signed:' "$TMP/s1" || fail "2a: la firma in corso doveva riuscire"
psqlq -c "delete from seasons where year = 2999; update seasons set is_current = true where id = $SEASON;" >/dev/null

# ---------- 2b. Chiusura in corso, poi firma ----------
reset
R=$(rev "$TA")
{ echo "begin;"; echo "select id from seasons where is_current for update;"; echo "select pg_sleep(2);"
  echo "update seasons set is_current = false where id = $SEASON; insert into seasons (year, is_current) values (2999, true);"; echo "commit;"; } \
  | psql -X -q -At -v ON_ERROR_STOP=1 >"$TMP/c1" 2>&1 &
sleep 0.7
session "$TMP/s2" "$(sign 910001 "$TA" "$R")" &
wait
grep -q 'CONFLICT: la stagione corrente è cambiata' "$TMP/s2" && ok "una firma a chiusura in corso non finisce nella stagione chiusa" \
  || fail "2b: la firma doveva dare CONFLICT sulla stagione ($(cat "$TMP/s2"))"
N=$(psqlq -c "select count(*) from contracts where player_id = 910001")
[ "$N" = 0 ] || fail "2b: la firma ha scritto $N contratti"
psqlq -c "delete from seasons where year = 2999; update seasons set is_current = true where id = $SEASON;" >/dev/null

# ---------- 3a. Scambi in versi opposti ----------
reset
RA=$(rev "$TA"); RB=$(rev "$TB"); VA=$(version 910011); VB=$(version 910012)
REVS="jsonb_build_object('$TA', $RA, '$TB', $RB)"
trade() { echo "select 'traded:' || public.admin_execute_trade(array['$1', '$2']::uuid[], '[{\"kind\":\"contract\",\"id\":$3,\"version\":$4,\"from\":\"$1\",\"to\":\"$2\"},{\"kind\":\"contract\",\"id\":$5,\"version\":$6,\"from\":\"$2\",\"to\":\"$1\"}]'::jsonb, 'conc-test', null, $REVS);"; }
session "$TMP/s1" "$(trade "$TA" "$TB" 910011 "$VA" 910012 "$VB")" "select pg_sleep(2);" &
sleep 0.5
session "$TMP/s2" "$(trade "$TB" "$TA" 910012 "$VB" 910011 "$VA")" &
wait
grep -qi 'deadlock\|40P01' "$TMP/s1" "$TMP/s2" && fail "3a: deadlock tra scambi opposti"
grep -q 'traded:' "$TMP/s1" && grep -q 'CONFLICT' "$TMP/s2" && ok "scambi opposti: nessun deadlock, il secondo dà CONFLICT" \
  || fail "3a: esiti inattesi ($(cat "$TMP/s1") / $(cat "$TMP/s2"))"

# ---------- 3b. Taglio contro scambio ----------
reset
RA=$(rev "$TA"); RB=$(rev "$TB"); VA=$(version 910011); VB=$(version 910012)
REVS="jsonb_build_object('$TA', $RA, '$TB', $RB)"
session "$TMP/s1" "$(trade "$TA" "$TB" 910011 "$VA" 910012 "$VB")" "select pg_sleep(2);" &
sleep 0.5
session "$TMP/s2" "select 'cut:' || public.admin_cut_player(910012, $VB, 0);" &
wait
grep -qi 'deadlock\|40P01' "$TMP/s1" "$TMP/s2" && fail "3b: deadlock tra taglio e scambio"
grep -q 'traded:' "$TMP/s1" && grep -q 'CONFLICT' "$TMP/s2" && ok "taglio contro scambio: nessun deadlock, il taglio dà CONFLICT" \
  || fail "3b: esiti inattesi ($(cat "$TMP/s1") / $(cat "$TMP/s2"))"

# ---------- 4. Proposte di scambio accettate, approvate in parallelo ----------
# $1 = id, $2 = movimenti. Proposte già accettate, inserite direttamente (le RPC delle squadre sono provate in rls.sql).
proposal() {
  psqlq -c "insert into trade_proposals (id, season_id, proposer_team_id, teams, moves, roster_revs, status, expires_at)
    values ($1, $SEASON, '$TA', array['$TA', '$TB']::uuid[], '$2'::jsonb, '{}'::jsonb, 'accepted', now() + interval '1 day');" >/dev/null
}
pversion() { psqlq -c "select version from trade_proposals where id = $1"; }
pstatus() { psqlq -c "select status from trade_proposals where id = $1"; }
approve() { echo "select 'approved:' || public.admin_approve_trade_proposal($1, $(pversion "$1"), 'conc-test', null, $REVS);"; }

reset
RA=$(rev "$TA"); RB=$(rev "$TB"); VA=$(version 910011); VB=$(version 910012)
REVS="jsonb_build_object('$TA', $RA, '$TB', $RB)"
MOVES="[{\"kind\":\"contract\",\"id\":910011,\"version\":$VA,\"from\":\"$TA\",\"to\":\"$TB\"},{\"kind\":\"contract\",\"id\":910012,\"version\":$VB,\"from\":\"$TB\",\"to\":\"$TA\"}]"
proposal 910001 "$MOVES"
proposal 910002 "$MOVES"
session "$TMP/s1" "$(approve 910001)" "select pg_sleep(2);" &
sleep 0.5
session "$TMP/s2" "$(approve 910002)" &
wait
grep -qi 'deadlock\|40P01' "$TMP/s1" "$TMP/s2" && fail "4a: deadlock tra due approvazioni"
grep -q 'approved:' "$TMP/s1" && grep -q 'CONFLICT' "$TMP/s2" && [ "$(pstatus 910002)" = superseded ] \
  && ok "due approvazioni con gli stessi giocatori: passa la prima, l'altra è superata" \
  || fail "4a: esiti inattesi ($(cat "$TMP/s1") / $(cat "$TMP/s2") / stato $(pstatus 910002))"

# ---------- 4b. Approvazione contro taglio ----------
reset
RA=$(rev "$TA"); RB=$(rev "$TB"); VA=$(version 910011); VB=$(version 910012)
REVS="jsonb_build_object('$TA', $RA, '$TB', $RB)"
MOVES="[{\"kind\":\"contract\",\"id\":910011,\"version\":$VA,\"from\":\"$TA\",\"to\":\"$TB\"},{\"kind\":\"contract\",\"id\":910012,\"version\":$VB,\"from\":\"$TB\",\"to\":\"$TA\"}]"
proposal 910003 "$MOVES"
session "$TMP/s1" "$(approve 910003)" "select pg_sleep(2);" &
sleep 0.5
session "$TMP/s2" "select 'cut:' || public.admin_cut_player(910012, $VB, 0);" &
wait
grep -qi 'deadlock\|40P01' "$TMP/s1" "$TMP/s2" && fail "4b: deadlock tra approvazione e taglio"
grep -q 'approved:' "$TMP/s1" && grep -q 'CONFLICT' "$TMP/s2" && ok "approvazione contro taglio: nessun deadlock, il taglio dà CONFLICT" \
  || fail "4b: esiti inattesi ($(cat "$TMP/s1") / $(cat "$TMP/s2"))"

if [ "$FAILS" -gt 0 ]; then echo "CONCORRENZA: $FAILS controlli falliti" >&2; exit 1; fi
echo "CONCORRENZA: tutti i test passati"
