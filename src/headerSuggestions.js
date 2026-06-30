export const HEADER_NAME_SUGGESTIONS = [
  "Accept",
  "Accept-Encoding",
  "Accept-Language",
  "Authorization",
  "Cache-Control",
  "Content-Length",
  "Content-Type",
  "Cookie",
  "If-Match",
  "If-None-Match",
  "Origin",
  "Referer",
  "User-Agent",
  "X-API-Key",
  "X-Auth-Token",
  "X-CSRF-Token",
  "X-Request-ID"
];

const MEDIA_TYPE_VALUES = [
  "application/json",
  "application/ld+json",
  "application/problem+json",
  "application/xml",
  "application/x-www-form-urlencoded",
  "application/octet-stream",
  "multipart/form-data",
  "text/plain",
  "text/html",
  "text/csv",
  "*/*"
];

const HEADER_VALUE_SUGGESTIONS = {
  accept: MEDIA_TYPE_VALUES,
  "content-type": MEDIA_TYPE_VALUES.filter((value) => value !== "*/*"),
  authorization: ["Bearer ", "Basic ", "Digest ", "ApiKey "],
  "cache-control": ["no-cache", "no-store", "max-age=0", "max-age=3600"],
  "accept-language": ["fr-FR", "fr-FR,fr;q=0.9,en;q=0.8", "en-US", "en-US,en;q=0.9"],
  "accept-encoding": ["gzip, deflate, br", "gzip", "br"],
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  cookie: ["session=", "token="],
  "x-request-id": ["req-"],
  "x-api-key": ["api-key-"],
  "x-auth-token": ["token-"],
  "x-csrf-token": ["csrf-"]
};

export const DEFAULT_HEADER_VALUE_SUGGESTIONS = [
  ...MEDIA_TYPE_VALUES,
  "Bearer ",
  "Basic ",
  "no-cache",
  "fr-FR",
  "gzip, deflate, br"
];

export function getHeaderValueSuggestions(headerName) {
  const normalizedName = headerName.trim().toLowerCase();
  return HEADER_VALUE_SUGGESTIONS[normalizedName] || DEFAULT_HEADER_VALUE_SUGGESTIONS;
}
