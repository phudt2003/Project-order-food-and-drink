const normalizeText = (value) => String(value ?? "").trim();

const normalizeKey = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");

const coercePositiveInt = (value, fallback = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const int = Math.floor(number);
  return int > 0 ? int : fallback;
};

const splitCommaString = (value) =>
  normalizeText(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const parseStringTopping = (value) => {
  const text = normalizeText(value);
  if (!text) return null;

  const match = text.match(/^(.*?)(?:\s*x\s*(\d+))\s*$/i);
  if (!match) return { name: text, quantity: 1 };

  const name = normalizeText(match[1]);
  const quantity = coercePositiveInt(match[2], 1);
  if (!name) return null;
  return { name, quantity };
};

const extractTopping = (entry) => {
  if (entry === null || entry === undefined) return null;

  if (typeof entry === "string" || typeof entry === "number") {
    return parseStringTopping(entry);
  }

  if (typeof entry !== "object") {
    return parseStringTopping(String(entry));
  }

  const name = normalizeText(entry?.name ?? entry?.topping?.name);
  if (!name) return null;

  const quantity = coercePositiveInt(
    entry?.quantity ?? entry?.qty ?? entry?.amount,
    1
  );

  return { name, quantity };
};

const toToppingsArray = (value) => {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) return value;

  if (typeof value === "string") return splitCommaString(value);

  return [value];
};

export const formatToppings = (toppings) => {
  const list = toToppingsArray(toppings);
  if (list.length === 0) return "";

  const merged = new Map();

  list.forEach((entry) => {
    const topping = extractTopping(entry);
    if (!topping) return;

    const key = normalizeKey(topping.name);
    if (!key) return;

    if (merged.has(key)) {
      const current = merged.get(key);
      merged.set(key, {
        name: current.name,
        quantity: current.quantity + topping.quantity,
      });
      return;
    }

    merged.set(key, topping);
  });

  return Array.from(merged.values())
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
    .map((t) => `${t.name} x${t.quantity}`)
    .join(", ");
};

export const normalizeToppingsKey = (toppings) =>
  normalizeKey(formatToppings(toppings));

