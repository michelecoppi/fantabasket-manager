# Regolamento — sintesi strutturata

Fonte: `REGOLAMENTO FANTABASKET.docx` ("Aggiornato 28/09/2024", tenuto in locale, non nel repo). Questa è una sintesi per sviluppatori; in caso di dubbio vale il documento originale. Gli ID (R-xx) servono per citare le regole nel codice e in PLAN.md.
Tutti i valori numerici sono **parametri di lega** (tabella `league_settings`), non costanti nel codice.

## Organi
- Presidente: Serde. Moderatore: Amedeo. Applicano le regole, ufficializzano gli scambi, possono autorizzare eccezioni. Nell'app il ruolo `admin` è assegnato a Scuti e Gabby (decisione utente), indipendentemente da presidente/moderatore.

## Franchigia e rosa
- R-01 Rosa obbligatoria: **13 titolari + 3..6 riserve**.
- R-02 Titolari: 5 Guardie, 5 Ali, 3 Centri.
- R-03 Riserve: min 3, max 6, qualsiasi ruolo, max 3 per ruolo; non schierabili. Stipendi pagati col **budget riserve = 80 crediti** (Z).
- R-04 Scambio titolare↔riserva ruolo per ruolo, **una volta ogni due settimane** in data prestabilita, solo se fattibile in crediti.
- Lo staff è fantasia, nessun impatto → fuori scope.

## Salary cap / floor / luxury tax
- R-10 Cap X = 250 (stagione 1). Tetto agli stipendi dei titolari.
- R-11 Cap effettivo stagione = X + bonus/malus campionato (vedi R-60). Verificato sul foglio: `SPAZIO SALARIALE = 250 + BONUS − MONTE INGAGGI`.
- R-12 Sforare il cap → luxury tax proporzionata ai soldi reali: stagione 2 = **1 € ogni 4 crediti sopra 250, fino a max 270**. Incassi divisi tra i "virtuosi" (sotto cap), priorità ai primi in classifica. Foglio: riga `BUDGET SFORATO`.
- R-13 Salary floor Y = X − X/5 (= 200). Se rosa completa ma sotto il floor, il proprietario ripartisce a piacere i crediti mancanti tra i suoi giocatori.

## Contratti
- R-20 Free agent: durate **0.5 / 1 / 2 / 3 stagioni**; devono finire a fine regular season (tranne il mezza stagione). Durata decisa alla firma, non modificabile dopo la data di deposito contratti.
- R-21 Mezza stagione (tipo two-way): a fine prova si può estendere (max 2.5 stagioni totali) o liberare.
- R-22 **Team option** (solo contratti da 1 o 2 stagioni): +1 stagione facoltativa allo stesso stipendio, da dichiarare alla firma; durata totale max 3 con option. Foglio: notazione `1+1`.
- R-23 Fine contratto:
  - mezza stagione senza estensione → *unrestricted* FA;
  - 1/2/3 stagioni senza option riscattata → *restricted* FA (il vecchio proprietario può pareggiare l'offerta più alta senza replica e firmare un secondo contratto);
  - option riscattata → *unrestricted*.
- R-24 **Niente due prelazioni consecutive** sullo stesso giocatore: dopo il secondo contratto è sempre unrestricted.
- R-25 Prezzo minimo all'asta di un ex-contratto = **metà dell'ultimo stipendio**, valida per 1 anno. Foglio: tabella `ULTIMO CONTRATTO`.
- R-26 Rookie: firma al "valore di ingresso" (crediti Dunkest a inizio prima stagione) per **max 2 stagioni** (anno in corso incluso). A fine contratto il proprietario ha il diritto di pareggio (restricted FA).

## Draft e squadra talenti
- R-30 Draft annuale (non il primo anno), dopo la summer league NBA, seguito dalla firma dei rookie.
- R-31 **5 turni**, 1 scelta per squadra per turno, stesso ordine in tutti i turni.
- R-32 Ordine: le prime 4 posizioni = lottery tra le ultime 4 della regular season (8ª: 4 chance, 7ª: 3, 6ª: 2, 5ª: 1); posizioni 5-8 in ordine inverso di classifica delle prime 4.
- R-33 Le pick sono scambiabili prima/durante/dopo; **max 2 pick per giro** per squadra.
- R-34 Le pick future diventano di proprietà solo **3 anni prima** del draft (nel foglio: DRAFT 2026-2028).
- R-35 I draftati vanno di default in **squadra talenti** (nessuno stipendio). Prelazione solo per la stagione d'esordio NBA e la successiva (chi gioca in leghe minori/estere resta congelato più a lungo). Dopo l'esordio, fino all'apertura della FA estiva dell'anno dopo per firmarlo o liberarlo. Max 2 stagioni in squadra talenti prima dell'obbligo di decisione.

## Tagli
- R-40 Prima di ogni asta si può tagliare qualsiasi numero di giocatori.
- R-41 I tagliati vanno all'**asta dei tagliati** (prima dell'asta principale); l'ex proprietario non può partecipare.
- R-42 Se nessuno li prende: o taglio definitivo (libera il posto, ma si paga **1/3 dello stipendio** fino a fine contratto) oppure il giocatore rientra in rosa. Foglio: sezione `GIOCATORI TAGLIATI`.

## Aste
- R-50 Due aste FA a stagione: una prima della regular season, una subito dopo la chiusura del mercato NBA. Ordine: tagliati → free agent (esclusi i rookie del draft).
- R-51 Metodo (asta "primo anno"): stile fantacalcio, i crediti sono lo **stipendio**, a turno chiama un giocatore, base d'asta = valore Dunkest riproporzionato al cap. Vince solo chi **supera** l'offerta (il pareggio non vale). La durata del contratto si sceglie dopo aver vinto.
- R-52 Fase 1: completare i 13 titolari entro X. Fase 2: 3 riserve (1 per ruolo) entro Z=80.

## Scambi
- R-55 Dopo l'asta estiva si apre il mercato scambi. Accordi privati, poi comunicati al moderatore che li rende ufficiali.
- R-56 Si scambiano giocatori (titolari/riserve/talenti) e pick.
- R-57 Gli scambi **non possono far sforare il cap** (il floor non conta). Eccezione: il moderatore, sentito il presidente, può autorizzare valutando: disponibilità a pagare la luxury tax, soglia di sicurezza, possibilità di rientrare con tagli/scambi/riserve.

## Premi
- R-60 Bonus/malus crediti stagione successiva per classifica finale: 1°+5, 2°+4, 3°+3, 4°+2, 5°0, 6°−1, 7°−2, 8°−3. (Foglio: `BONUS CAMPIONATO`.)
- R-61 Premi in denaro: 1° ~15 € (min 10) + anello, 2° 10 €, 3° 5 €.

## Varie
- R-70 Vietato modificare la formazione per perdere apposta; gli admin possono penalizzare.
