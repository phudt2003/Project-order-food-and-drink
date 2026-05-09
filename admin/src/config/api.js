const buildApiList = () => {
  const localUrl = (import.meta.env.VITE_API_URL_LOCAL || "http://localhost:4000").trim();
  const remoteUrl = (import.meta.env.VITE_API_URL_REMOTE || "https://tieu-luan-web.onrender.com").trim();

  return [localUrl, remoteUrl].filter(Boolean);
};

export const API_URLS = buildApiList();

const isOkResponse = (response) => response && response.ok;

const isLocalLikeHost = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  if (["localhost", "127.0.0.1"].includes(host)) return true;
  if (host.endsWith(".ngrok-free.dev") || host.endsWith(".ngrok.io")) return true;
  return false;
};

const hasNonEmptyList = async (response) => {
  try {
    const json = await response.clone().json();
    const list = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.data)
        ? json.data.data
        : null;
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
};

export const pickApiBase = async (options = {}) => {
  const {
    timeoutMs = 2500,
    preferNonEmpty = !isLocalLikeHost(),
  } = options;
  let firstOk = "";

  for (const base of API_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${base}/api/product/list`, { signal: controller.signal });
      clearTimeout(timer);

      if (isOkResponse(response)) {
        if (!firstOk) firstOk = base;
        if (!preferNonEmpty) return base;
        if (await hasNonEmptyList(response)) return base;
      }
    } catch {
      // Try next base URL
    }
  }

  return firstOk || API_URLS[0] || "";
};

