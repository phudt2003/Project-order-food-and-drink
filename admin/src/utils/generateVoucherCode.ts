// Hàm sinh mã voucher dễ đọc (tránh 0/O/1/I) + có thể retry khi trùng.

export const VOUCHER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const normalizeVoucherCode = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const randomFromAlphabet = (length: number) => {
  const n = Math.max(1, Math.floor(length));
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(Math.random() * VOUCHER_ALPHABET.length);
    out += VOUCHER_ALPHABET[idx];
  }
  return out;
};

export const generateVoucherCode = ({
  prefix = "BINGO",
  length = 6,
}: {
  prefix?: string;
  length?: number;
}) => {
  const safePrefix = normalizeVoucherCode(prefix) || "BINGO";
  const body = randomFromAlphabet(Math.max(6, Math.min(8, length)));
  return `${safePrefix}-${body}`;
};

// Sinh mã và tự retry nếu bị trùng (hiếm).
export const generateUniqueVoucherCode = async ({
  prefix,
  length = 6,
  maxAttempts = 12,
  isAvailable,
}: {
  prefix: string;
  length?: number;
  maxAttempts?: number;
  isAvailable: (code: string) => Promise<boolean>;
}) => {
  const attempts = Math.max(1, Math.floor(maxAttempts));
  for (let i = 0; i < attempts; i += 1) {
    const code = generateVoucherCode({ prefix, length });
    // eslint-disable-next-line no-await-in-loop
    const ok = await isAvailable(code);
    if (ok) return code;
  }

  // Fallback: trả về mã cuối cùng để UI vẫn hiển thị, và sẽ báo "đã tồn tại" nếu trùng.
  return generateVoucherCode({ prefix, length });
};

