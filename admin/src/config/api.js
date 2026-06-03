const DEFAULT_API_URL = "https://order-food-and-drink-project.onrender.com";

const buildApiList = () => {
  const allowLocalApi = isLocalLikeHost();
  const primaryUrl = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim();
  const remoteUrl = (import.meta.env.VITE_API_URL_REMOTE || DEFAULT_API_URL).trim();
  const localUrl = (import.meta.env.VITE_API_URL_LOCAL || "").trim();
  const urls = allowLocalApi
    ? [localUrl, primaryUrl, remoteUrl]
    : [primaryUrl, remoteUrl, localUrl];

  return [...new Set(urls.filter((url) => url && (allowLocalApi || !isLocalApiUrl(url))))];
};

const isOkResponse = (response) => response && response.ok;

const isLocalLikeHost = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  if (["localhost", "127.0.0.1"].includes(host)) return true;
  if (host.endsWith(".ngrok-free.dev") || host.endsWith(".ngrok.io")) return true;
  return false;
};

const isLocalApiUrl = (value = "") => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ["localhost", "127.0.0.1"].includes(host);
  } catch {
    return false;
  }
};

export const API_URLS = buildApiList();

export const pickApiBase = async (options = {}) => {
  const {
    timeoutMs = 2500,
    healthPath = "/",
  } = options;

  for (const base of API_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${base}${healthPath}`, { signal: controller.signal });
      clearTimeout(timer);

      if (isOkResponse(response)) {
        return base;
      }
    } catch {
      // Try next base URL
    }
  }

  return API_URLS[0] || "";
};

