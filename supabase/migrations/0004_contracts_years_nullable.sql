-- Ingaggi d'asta senza durata: nel foglio compaiono senza prefisso ("Durant 35") perché gli anni di contratto
-- non sono ancora stati decisi (confermato dall'utente, vedi docs/OPEN-QUESTIONS.md). null = da decidere;
-- il check `years_left > 0` lascia passare null.
alter table contracts alter column years_left drop not null;
