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
