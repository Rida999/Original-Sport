export const money = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v || 0);
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
