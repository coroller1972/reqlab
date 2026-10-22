import dns from "node:dns/promises";
import net from "node:net";

const MAX_BODY_BYTES = 1024 * 1024;
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CROSS_ORIGIN_STRIPPED_HEADERS = new Set(["authorization", "cookie"]);
const BODY_HEADERS = new Set(["content-type", "content-encoding", "content-language", "content-location"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const BLOCKED_REQUEST_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "forwarded",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto"
]);

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed");
  }

  const allowPrivateNetwork = isPrivateNetworkAllowed();
  if (allowPrivateNetwork && !process.env.REQLAB_PROXY_TOKEN) {
    return sendError(res, 500, "REQLAB_PROXY_TOKEN est requis quand REQLAB_ALLOW_PRIVATE_NETWORK est actif.");
  }

  if (!isAuthorized(req)) {
    return sendError(res, 401, "Proxy token invalide ou manquant.");
  }

  try {
    const payload = await readJsonBody(req);
    const method = String(payload.method || "GET").toUpperCase();
    const targetUrl = new URL(String(payload.url || ""));

    if (!ALLOWED_METHODS.has(method)) {
      return sendError(res, 400, "Methode HTTP non supportee.");
    }

    await assertSafeTargetUrl(targetUrl, { allowPrivateNetwork });

    const body = typeof payload.body === "string" ? payload.body : "";
    const headers = sanitizeHeaders(payload.headers);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const upstream = await fetchWithSafeRedirects(targetUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
        allowPrivateNetwork
      });
      const responseBody = method === "HEAD" ? "" : await upstream.text();
      const responseHeaders = Object.fromEntries(upstream.headers.entries());

      return res.status(200).json({
        ok: upstream.ok,
        status: upstream.status,
        statusText: upstream.statusText,
        elapsedMs: Date.now() - startedAt,
        size: Buffer.byteLength(responseBody),
        headers: responseHeaders,
        body: responseBody,
        receivedAt: new Date().toISOString(),
        via: "proxy"
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const status = error.statusCode || 502;
    const message = error.name === "AbortError" ? "Timeout proxy apres 20 secondes." : error.message;
    return sendError(res, status, message);
  }
}

function setCorsHeaders(req, res) {
  const allowedOrigin = process.env.REQLAB_ALLOWED_ORIGIN;
  const requestOrigin = req.headers.origin;
  const fallbackOrigin = isPrivateNetworkAllowed() ? null : requestOrigin || "*";
  const corsOrigin = allowedOrigin || fallbackOrigin;
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-ReqLab-Proxy-Token");
  res.setHeader("Vary", "Origin");
}

// Option reservee au developpement local : ignoree sur les deploiements Vercel (preview et production).
function isPrivateNetworkAllowed() {
  if (process.env.REQLAB_ALLOW_PRIVATE_NETWORK !== "true") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  return !vercelEnv || vercelEnv === "development";
}

function isAuthorized(req) {
  const expectedToken = process.env.REQLAB_PROXY_TOKEN;
  if (!expectedToken) return true;
  return req.headers["x-reqlab-proxy-token"] === expectedToken;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Payload proxy trop volumineux.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function assertSafeTargetUrl(targetUrl, { allowPrivateNetwork = false } = {}) {
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    const error = new Error("Seules les URLs http et https sont autorisees.");
    error.statusCode = 400;
    throw error;
  }

  if (targetUrl.username || targetUrl.password) {
    const error = new Error("Les credentials dans l'URL ne sont pas autorises.");
    error.statusCode = 400;
    throw error;
  }

  if (allowPrivateNetwork) return;

  const hostname = targetUrl.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    const error = new Error("URL cible locale ou privee bloquee par securite.");
    error.statusCode = 400;
    throw error;
  }

  const resolvedAddresses = await dns.lookup(hostname, { all: true, verbatim: false });
  if (resolvedAddresses.some(({ address }) => isPrivateAddress(address))) {
    const error = new Error("La cible resout vers une adresse privee ou locale.");
    error.statusCode = 400;
    throw error;
  }
}

async function fetchWithSafeRedirects(targetUrl, { method, headers, body, signal, allowPrivateNetwork }) {
  let currentUrl = targetUrl;
  let currentMethod = method;
  let currentHeaders = headers;
  let currentBody = body;

  for (let redirectCount = 0; ; redirectCount++) {
    const response = await fetch(currentUrl, {
      method: currentMethod,
      headers: currentHeaders,
      body: ["GET", "HEAD"].includes(currentMethod) ? undefined : currentBody,
      redirect: "manual",
      signal
    });

    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response;

    await response.body?.cancel();

    if (redirectCount >= MAX_REDIRECTS) {
      const error = new Error(`Trop de redirections (maximum ${MAX_REDIRECTS}).`);
      error.statusCode = 502;
      throw error;
    }

    const nextUrl = new URL(location, currentUrl);
    try {
      await assertSafeTargetUrl(nextUrl, { allowPrivateNetwork });
    } catch (error) {
      error.message = `Redirection vers ${nextUrl.href} refusee : ${error.message}`;
      throw error;
    }

    const switchesToGet =
      (response.status === 303 && !["GET", "HEAD"].includes(currentMethod)) ||
      ([301, 302].includes(response.status) && currentMethod === "POST");
    if (switchesToGet) {
      currentMethod = "GET";
      currentBody = "";
      currentHeaders = omitHeaders(currentHeaders, BODY_HEADERS);
    }

    if (nextUrl.origin !== currentUrl.origin) {
      currentHeaders = omitHeaders(currentHeaders, CROSS_ORIGIN_STRIPPED_HEADERS);
    }

    currentUrl = nextUrl;
  }
}

function omitHeaders(headers, names) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !names.has(key.toLowerCase())));
}

function isBlockedHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    isPrivateAddress(hostname)
  );
}

function isPrivateAddress(address) {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isPrivateIpv4(address);
  if (ipVersion === 6) return isPrivateIpv6(address);
  return false;
}

function isPrivateIpv4(address) {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  return Object.entries(headers).reduce((safeHeaders, [key, value]) => {
    const headerName = String(key).trim();
    if (!headerName || BLOCKED_REQUEST_HEADERS.has(headerName.toLowerCase())) return safeHeaders;
    safeHeaders[headerName] = String(value);
    return safeHeaders;
  }, {});
}

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message
  });
}
