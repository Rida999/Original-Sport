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
