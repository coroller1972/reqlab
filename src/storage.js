export const STORAGE_KEY = "reqlab.requests.v1";
export const THEME_KEY = "reqlab.theme.v1";
export const TRANSPORT_MODE_KEY = "reqlab.transportMode.v1";
export const PROXY_TOKEN_KEY = "reqlab.proxyToken.v1";

const LEGACY_STORAGE_KEY = "requesty.requests.v1";
const LEGACY_THEME_KEY = "requesty.theme.v1";

export function loadRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRequests(requests) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

export function clearRequests() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function loadTheme() {
  const storedTheme = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

export function loadTransportMode() {
  const storedMode = localStorage.getItem(TRANSPORT_MODE_KEY);
  return storedMode === "proxy" ? "proxy" : "browser";
}

export function saveTransportMode(mode) {
  localStorage.setItem(TRANSPORT_MODE_KEY, mode);
}

export function loadProxyToken() {
  return localStorage.getItem(PROXY_TOKEN_KEY) || "";
}

export function saveProxyToken(token) {
  if (token) {
    localStorage.setItem(PROXY_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(PROXY_TOKEN_KEY);
  }
}
