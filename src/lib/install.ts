// Installazione da Safari su iPhone: iOS non offre un prompt, quindi l'app deve spiegare i passi (Condividi → Aggiungi alla schermata Home).

/** Safari su iPhone o iPad. L'iPad in "sito desktop" dichiara Macintosh e si riconosce dai tocchi. Chrome, Firefox ed Edge su iOS sono esclusi. */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const safari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  return ios && safari;
}
