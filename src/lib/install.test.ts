import { describe, expect, it } from "vitest";
import { isIosSafari } from "./install";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/139.0 Mobile/15E148 Safari/605.1.15";
// iPad in "sito desktop" e Mac hanno lo stesso UA: cambia solo maxTouchPoints.
const DESKTOP_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

describe("isIosSafari", () => {
  it("riconosce Safari su iPhone", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
  });

  it("riconosce Safari su iPad in modalità desktop (tocchi > 1)", () => {
    expect(isIosSafari(DESKTOP_SAFARI, 5)).toBe(true);
  });

  it("esclude Chrome e Firefox su iPhone, che non installano da menu Condividi", () => {
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_FIREFOX, 5)).toBe(false);
  });

  it("esclude Mac e Android", () => {
    expect(isIosSafari(DESKTOP_SAFARI, 0)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});
