import dns from "node:dns/promises";
import net from "node:net";

const MAX_BODY_BYTES = 1024 * 1024;
const TIMEOUT_MS = 20000;
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

    await assertSafeTargetUrl(targetUrl);

    const body = typeof payload.body === "string" ? payload.body : "";
    const headers = sanitizeHeaders(payload.headers);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body: ["GET", "HEAD"].includes(method) ? undefined : body,
        redirect: "follow",
        signal: controller.signal
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
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin || requestOrigin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-ReqLab-Proxy-Token");
  res.setHeader("Vary", "Origin");
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

async function assertSafeTargetUrl(targetUrl) {
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
