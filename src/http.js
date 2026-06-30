export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function headerRowsToObject(rows) {
  return rows.reduce((headers, row) => {
    const key = row.key.trim();
    if (key) headers[key] = row.value;
    return headers;
  }, {});
}

export function objectToHeaderRows(headers = {}) {
  const entries = Object.entries(headers);
  return entries.length
    ? entries.map(([key, value]) => ({ id: crypto.randomUUID(), key, value: String(value) }))
    : [{ id: crypto.randomUUID(), key: "", value: "" }];
}

export function formatJsonIfPossible(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function guessRequestName(method, url) {
  if (!url.trim()) return "Nouvelle requete";
  try {
    const parsed = new URL(url);
    return `${method} ${parsed.hostname}${parsed.pathname}`;
  } catch {
    return `${method} ${url}`.slice(0, 80);
  }
}

export async function sendHttpRequest({ method, url, headers, body }) {
  const startedAt = performance.now();
  const options = {
    method,
    headers
  };

  if (!["GET", "HEAD"].includes(method) && body.trim()) {
    options.body = body;
  }

  const response = await fetch(url, options);
  const elapsedMs = Math.round(performance.now() - startedAt);
  const responseText = method === "HEAD" ? "" : await response.text();
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    elapsedMs,
    size: new Blob([responseText]).size,
    headers: responseHeaders,
    body: responseText,
    receivedAt: new Date().toISOString()
  };
}

export async function sendProxyRequest({ method, url, headers, body, token }) {
  const proxyHeaders = {
    "Content-Type": "application/json"
  };
  if (token.trim()) {
    proxyHeaders["X-ReqLab-Proxy-Token"] = token.trim();
  }

  const response = await fetch("/api/proxy", {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify({
      method,
      url,
      headers,
      body
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Proxy indisponible (${response.status}).`);
  }

  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload;
}
