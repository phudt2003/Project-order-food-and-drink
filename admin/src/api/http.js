import axios from "axios";
import { clearAdminToken, readAdminToken } from "../utils/adminToken";

const http = axios.create();

http.interceptors.request.use((config) => {
  const token = readAdminToken();
  if (!token) return config;

  config.headers = config.headers ?? {};

  if (!config.headers.Authorization && !config.headers.authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (!config.headers.token) {
    config.headers.token = token;
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      clearAdminToken();
      if (typeof window !== "undefined") {
        const currentPath = window.location?.pathname || "";
        if (!currentPath.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default http;
