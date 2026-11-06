-- R-12: luxury tax a 1 € per ogni 5 crediti sopra il cap (prima 1 € ogni 4), scaglione iniziato = pieno (ceil in cap.ts).
update league_settings set value = 5 where key = 'tax_credits_per_euro';
