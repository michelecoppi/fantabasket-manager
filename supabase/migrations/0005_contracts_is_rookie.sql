-- La sigla `r` del foglio vuol dire contratto rookie (R-26), non "restricted": colonna dedicata.
-- `restriction` resta solo per `u` (unrestricted). Le righe già importate con 'restricted' erano tutte `r`.
alter table contracts add column is_rookie boolean not null default false;
update contracts set is_rookie = true, restriction = null where restriction = 'restricted';
