export const resolveImageSrc = (raw, apiBase) => {
  if (!raw) return "";

  const value = String(raw).trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return value;
  }

  const base = String(apiBase || "").replace(/\/+$/, "");
  if (!base) return value;

  if (value.startsWith("uploads/")) {
    return `${base}/images/${value.replace(/^uploads\//, "")}`;
  }

  if (value.startsWith("/images/")) {
    return `${base}${value}`;
  }

  if (value.startsWith("/")) {
    return value;
  }

  if (value.startsWith("images/")) {
    return `${base}/${value}`;
  }

  if (!value.includes("/")) {
    return `${base}/images/${value}`;
  }

  return `${base}/${value}`;
};
