/** Riduce un nome a lettere e cifre minuscole, senza accenti né punteggiatura: "Jaquez Jr." → "jaquezjr". */
export const lettersOnly = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
