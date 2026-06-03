const DEFAULT_API_URL = "http://localhost:4000";

const buildApiList = () => {
  const apiUrl = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim();
  return apiUrl ? [apiUrl] : [];
};

const isOkResponse = (response) => response && response.ok;

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

