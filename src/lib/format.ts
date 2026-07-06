export const money = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  // Locale is forced to en-US so this always renders as "$X.XX" - leaving it
  // to the browser's locale can render USD as "USD X.XX" or "X.XX US$" on
  // non-US-English systems.
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
};

export const stripBracketedNumber = (s: string) =>
  s.replace(/\s*\(\s*\d+(\s*\/\s*\d+)?\s*\)\s*$/, "").trim();

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const generateBarcode = () => {
  // 13 digit EAN-style (no checksum validation, just unique)
  const base = Date.now().toString().slice(-10);
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return base + rand;
};
