const ADMIN_TOKEN_KEY = "admin_token";
// Only accept explicit admin tokens to avoid picking up user tokens.
const ADMIN_TOKEN_KEYS = [ADMIN_TOKEN_KEY, "adminToken"];

const decodeBase64Url = (value = "") => {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return atob(padded);
  } catch (error) {
    return "";
  }
};

const getTokenPayload = (token = "") => {
  const parts = String(token).split(".");
  if (parts.length < 2) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
};

export const getAdminTokenExpiryMs = (token) => {
  const payload = getTokenPayload(token);
  if (!payload || !payload.exp) return null;
  return payload.exp * 1000;
};

export const isAdminTokenExpired = (token) => {
  const payload = getTokenPayload(token);
  if (!payload || !payload.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
};

export const readAdminToken = () => {
  if (typeof window === "undefined") return "";

  for (const key of ADMIN_TOKEN_KEYS) {
    const value = window.localStorage.getItem(key);
    if (typeof value === "string" && value.trim()) {
      if (isAdminTokenExpired(value)) {
        for (const k of ADMIN_TOKEN_KEYS) {
          window.localStorage.removeItem(k);
        }
        return "";
      }
      return value;
    }
  }

  return "";
};

export const writeAdminToken = (token) => {
  if (typeof window === "undefined") return;
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;

  window.localStorage.setItem(ADMIN_TOKEN_KEY, normalizedToken);
  for (const key of ADMIN_TOKEN_KEYS) {
    if (key !== ADMIN_TOKEN_KEY) {
      window.localStorage.removeItem(key);
    }
  }
};

export const clearAdminToken = () => {
  if (typeof window === "undefined") return;
  for (const key of ADMIN_TOKEN_KEYS) {
    window.localStorage.removeItem(key);
  }
};
