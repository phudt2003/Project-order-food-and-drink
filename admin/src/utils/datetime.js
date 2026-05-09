const VIETNAM_TZ = "Asia/Ho_Chi_Minh";

export const formatDateTimeVn = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  // "sv-SE" yields "YYYY-MM-DD HH:mm:ss" with 24h time.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: VIETNAM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

