import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  HTTP_METHODS,
  formatJsonIfPossible,
  guessRequestName,
  headerRowsToObject,
  objectToHeaderRows,
  sendHttpRequest,
  sendProxyRequest
} from "./http.js";
import { HEADER_NAME_SUGGESTIONS, getHeaderValueSuggestions } from "./headerSuggestions.js";
import {
  clearRequests,
  loadEnvironmentVariables,
  loadProxyToken,
  loadRequests,
  loadTheme,
  loadTransportMode,
  saveEnvironmentVariables,
  saveProxyToken,
  saveRequests,
  saveTheme,
  saveTransportMode
} from "./storage.js";

const blankRequest = () => ({
  id: crypto.randomUUID(),
  name: "Nouvelle requete",
  method: "GET",
  url: "",
  headers: [{ id: crypto.randomUUID(), key: "", value: "" }],
  body: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastResponseSummary: null
});

const blankEnvironmentVariable = () => ({
  id: crypto.randomUUID(),
  key: "",
  value: ""
});

const VARIABLE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function buildEnvironmentMap(variables) {
  return variables.reduce((map, variable) => {
    const key = variable.key.trim();
    if (key) map.set(key, variable.value);
    return map;
  }, new Map());
}

function resolveEnvironmentVariables(value, variablesMap, missingVariables) {
  return value.replace(VARIABLE_PATTERN, (placeholder, key) => {
    if (!variablesMap.has(key)) {
      missingVariables.add(key);
      return placeholder;
    }

    return variablesMap.get(key);
  });
}

function App() {
  const [requests, setRequests] = useState(() => loadRequests());
  const [activeRequest, setActiveRequest] = useState(() => blankRequest());
  const [selectedId, setSelectedId] = useState(null);
  const [requestTab, setRequestTab] = useState("headers");
  const [responseTab, setResponseTab] = useState("body");
  const [prettyJson, setPrettyJson] = useState(true);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [theme, setTheme] = useState(() => loadTheme());
  const [transportMode, setTransportMode] = useState(() => loadTransportMode());
  const [proxyToken, setProxyToken] = useState(() => loadProxyToken());
  const [environmentVariables, setEnvironmentVariables] = useState(() => {
    const storedVariables = loadEnvironmentVariables();
    return storedVariables.length ? storedVariables : [blankEnvironmentVariable()];
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    saveRequests(requests);
  }, [requests]);

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveTransportMode(transportMode);
  }, [transportMode]);

  useEffect(() => {
    saveProxyToken(proxyToken);
  }, [proxyToken]);

  useEffect(() => {
    saveEnvironmentVariables(environmentVariables);
  }, [environmentVariables]);

  const responseBody = useMemo(() => {
    if (!response?.body) return "";
    return prettyJson ? formatJsonIfPossible(response.body) : response.body;
  }, [prettyJson, response]);

  const updateActive = (patch) => {
    setActiveRequest((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateHeader = (id, patch) => {
    updateActive({
      headers: activeRequest.headers.map((header) => (header.id === id ? { ...header, ...patch } : header))
    });
  };

  const addHeader = () => {
    updateActive({
      headers: [...activeRequest.headers, { id: crypto.randomUUID(), key: "", value: "" }]
    });
  };

  const removeHeader = (id) => {
    const nextHeaders = activeRequest.headers.filter((header) => header.id !== id);
    updateActive({
      headers: nextHeaders.length ? nextHeaders : [{ id: crypto.randomUUID(), key: "", value: "" }]
    });
  };

  const updateEnvironmentVariable = (id, patch) => {
    setEnvironmentVariables((current) =>
      current.map((variable) => (variable.id === id ? { ...variable, ...patch } : variable))
    );
  };

  const addEnvironmentVariable = () => {
    setEnvironmentVariables((current) => [...current, blankEnvironmentVariable()]);
  };

  const removeEnvironmentVariable = (id) => {
    setEnvironmentVariables((current) => {
      const nextVariables = current.filter((variable) => variable.id !== id);
      return nextVariables.length ? nextVariables : [blankEnvironmentVariable()];
    });
  };

  const newRequest = () => {
    setActiveRequest(blankRequest());
    setSelectedId(null);
    setResponse(null);
    setError("");
  };

  const saveActiveRequest = () => {
    const now = new Date().toISOString();
    const requestToSave = {
      ...activeRequest,
      name: activeRequest.name.trim() || guessRequestName(activeRequest.method, activeRequest.url),
      updatedAt: now,
      createdAt: activeRequest.createdAt || now
    };

    setRequests((current) => {
      const exists = current.some((request) => request.id === requestToSave.id);
      if (exists) {
        return current.map((request) => (request.id === requestToSave.id ? requestToSave : request));
      }
      return [requestToSave, ...current];
    });
    setActiveRequest(requestToSave);
    setSelectedId(requestToSave.id);
  };

  const selectRequest = (request) => {
    setSelectedId(request.id);
    setActiveRequest({
      ...request,
      headers: request.headers?.length ? request.headers : objectToHeaderRows(request.headerObject)
    });
    setResponse(null);
    setError("");
  };

  const deleteRequest = (id) => {
    setRequests((current) => current.filter((request) => request.id !== id));
    if (selectedId === id) newRequest();
  };

  const clearAll = () => {
    clearRequests();
    setRequests([]);
    newRequest();
  };

  const exportRequests = () => {
    const payload = JSON.stringify(requests, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reqlab-requests.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRequests = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Le fichier doit contenir un tableau.");

      const normalized = parsed.map((request) => ({
        id: request.id || crypto.randomUUID(),
        name: request.name || guessRequestName(request.method || "GET", request.url || ""),
        method: HTTP_METHODS.includes(request.method) ? request.method : "GET",
        url: request.url || "",
        headers: Array.isArray(request.headers)
          ? request.headers.map((header) => ({
              id: header.id || crypto.randomUUID(),
              key: header.key || "",
              value: header.value || ""
            }))
          : objectToHeaderRows(request.headers && typeof request.headers === "object" ? request.headers : {}),
        body: request.body || "",
        createdAt: request.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastResponseSummary: request.lastResponseSummary || null
      }));

      setRequests(normalized);
      setError("");
    } catch (importError) {
      setError(`Import impossible : ${importError.message}`);
    } finally {
      event.target.value = "";
    }
  };

  const formatRequestBody = () => {
    updateActive({ body: formatJsonIfPossible(activeRequest.body) });
  };

  const sendRequest = async () => {
    setError("");
    setResponse(null);

    if (!activeRequest.url.trim()) {
      setError("Renseigne une URL avant d'envoyer la requete.");
      return;
    }

    const variablesMap = buildEnvironmentMap(environmentVariables);
    const missingVariables = new Set();
    const resolvedUrl = resolveEnvironmentVariables(activeRequest.url, variablesMap, missingVariables);
    const resolvedHeaders = Object.fromEntries(
      Object.entries(headerRowsToObject(activeRequest.headers)).map(([key, value]) => [
        key,
        resolveEnvironmentVariables(value, variablesMap, missingVariables)
      ])
    );
    const resolvedBody = resolveEnvironmentVariables(activeRequest.body, variablesMap, missingVariables);

    if (missingVariables.size) {
      setError(`Variable manquante : ${Array.from(missingVariables).join(", ")}.`);
      return;
    }

    try {
      new URL(resolvedUrl);
    } catch {
      setError("L'URL doit etre complete, par exemple https://api.example.com/users.");
      return;
    }

    setIsSending(true);
    try {
      const requestPayload = {
        method: activeRequest.method,
        url: resolvedUrl,
        headers: resolvedHeaders,
        body: resolvedBody
      };
      const result =
        transportMode === "proxy"
          ? await sendProxyRequest({
              ...requestPayload,
              token: proxyToken
            })
          : await sendHttpRequest(requestPayload);
      setResponse(result);

      const summary = {
        status: result.status,
        statusText: result.statusText,
        elapsedMs: result.elapsedMs,
        receivedAt: result.receivedAt
      };
      const nextRequest = {
        ...activeRequest,
        name: activeRequest.name === "Nouvelle requete" ? guessRequestName(activeRequest.method, activeRequest.url) : activeRequest.name,
        lastResponseSummary: summary,
        updatedAt: new Date().toISOString()
      };
      setActiveRequest(nextRequest);
      setRequests((current) => {
        const exists = current.some((request) => request.id === nextRequest.id);
        if (exists) return current.map((request) => (request.id === nextRequest.id ? nextRequest : request));
        return [nextRequest, ...current];
      });
      setSelectedId(nextRequest.id);
    } catch (sendError) {
      const corsHint =
        transportMode === "browser"
          ? " En mode navigateur, certaines APIs peuvent etre bloquees par CORS. Essaie le mode proxy si la Function est disponible."
          : "";
      setError(`Requete impossible : ${sendError.message}.${corsHint}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/reqlab-icon.png" alt="" />
          <div>
            <h1>ReqLab</h1>
            <p>Atelier HTTP local</p>
          </div>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="primary subtle" onClick={newRequest}>
            Nouvelle
          </button>
          <button type="button" onClick={saveActiveRequest}>
            Sauver
          </button>
        </div>

        <div className="import-export">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <button type="button" onClick={exportRequests} disabled={!requests.length}>
            Export JSON
          </button>
          <input ref={fileInputRef} className="file-input" type="file" accept="application/json" onChange={importRequests} />
        </div>

        <div className="request-list-header">
          <span>Requetes</span>
          <strong>{requests.length}</strong>
        </div>

        <div className="request-list">
          {requests.length === 0 ? (
            <div className="empty-state">Aucune requete sauvegardee pour l'instant.</div>
          ) : (
            requests.map((request) => (
              <button
                type="button"
                key={request.id}
                className={`request-item ${selectedId === request.id ? "active" : ""}`}
                onClick={() => selectRequest(request)}
              >
                <span className={`method method-${request.method.toLowerCase()}`}>{request.method}</span>
                <span className="request-name">{request.name}</span>
                {request.lastResponseSummary && <span className="request-status">{request.lastResponseSummary.status}</span>}
                <span
                  role="button"
                  tabIndex="0"
                  className="delete-request"
                  aria-label={`Supprimer ${request.name}`}
                  title="Supprimer la requete"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteRequest(request.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteRequest(request.id);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            ))
          )}
        </div>

        <button type="button" className="danger clear-button" onClick={clearAll} disabled={!requests.length}>
          Tout rincer
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <label htmlFor="request-name">Nom</label>
            <input
              id="request-name"
              className="name-input"
              value={activeRequest.name}
              onChange={(event) => updateActive({ name: event.target.value })}
            />
          </div>
          <div className="topbar-controls">
            <button
              type="button"
              className="icon-button"
              aria-label="Ouvrir la configuration"
              title="Configuration"
              onClick={() => setSettingsOpen(true)}
            >
              <GearIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={theme === "dark" ? "Passer au theme clair" : "Passer au theme sombre"}
              title={theme === "dark" ? "Theme clair" : "Theme sombre"}
              onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="topbar-meta">
              <span>{selectedId ? "Sauvegardee" : "Brouillon"}</span>
            </div>
          </div>
        </header>

        {settingsOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
            <section
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <h2 id="settings-title">Configuration</h2>
                  <p>Parametres locaux de ReqLab</p>
                </div>
                <button type="button" className="icon-button" aria-label="Fermer la configuration" onClick={() => setSettingsOpen(false)}>
                  <CloseIcon />
                </button>
              </div>

              <label className="settings-field">
                <span>Token proxy</span>
                <input
                  type="password"
                  placeholder="Optionnel en local, requis si REQLAB_PROXY_TOKEN est configure"
                  value={proxyToken}
                  onChange={(event) => setProxyToken(event.target.value)}
                />
              </label>

              <p className="settings-help">
                Ce token reste dans le localStorage de ce navigateur et est envoye uniquement en mode Proxy via le header
                <code>X-ReqLab-Proxy-Token</code>.
              </p>

              <div className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h3>Variables d'environnement</h3>
                    <p>Utilise la syntaxe ${"{NOM_VARIABLE}"} dans l'URL, les headers ou le body.</p>
                  </div>
                  <button type="button" onClick={addEnvironmentVariable}>
                    Ajouter
                  </button>
                </div>

                <div className="environment-editor">
                  {environmentVariables.map((variable) => (
                    <div className="environment-row" key={variable.id}>
                      <input
                        placeholder="BEARER_TOKEN"
                        value={variable.key}
                        onChange={(event) => updateEnvironmentVariable(variable.id, { key: event.target.value })}
                      />
                      <input
                        placeholder="Valeur"
                        value={variable.value}
                        onChange={(event) => updateEnvironmentVariable(variable.id, { value: event.target.value })}
                      />
                      <button
                        type="button"
                        aria-label="Supprimer la variable"
                        onClick={() => removeEnvironmentVariable(variable.id)}
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>

                <p className="settings-help">
                  Exemple : <code>Authorization: Bearer ${"{BEARER_TOKEN}"}</code>. Les variables restent locales a ce
                  navigateur et ne sont injectees qu'au moment de l'envoi.
                </p>
              </div>
            </section>
          </div>
        )}

        <section className="request-line" aria-label="Compositeur de requete">
          <select value={activeRequest.method} onChange={(event) => updateActive({ method: event.target.value })}>
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <input
            className="url-input"
            type="url"
            placeholder="https://api.example.com/resource"
            value={activeRequest.url}
            onChange={(event) => updateActive({ url: event.target.value })}
          />
          <button type="button" className="primary send-button" onClick={sendRequest} disabled={isSending}>
            {isSending ? "Envoi..." : "Envoyer"}
          </button>
        </section>

        <section className="transport-panel" aria-label="Mode d'envoi">
          <div className="segmented-control">
            <button
              type="button"
              className={transportMode === "browser" ? "active" : ""}
              onClick={() => setTransportMode("browser")}
            >
              Navigateur
            </button>
            <button type="button" className={transportMode === "proxy" ? "active" : ""} onClick={() => setTransportMode("proxy")}>
              Proxy
            </button>
          </div>
          <span className="transport-hint">
            {transportMode === "proxy" ? "Utilise /api/proxy avec le token configure." : "Envoi direct depuis le navigateur."}
          </span>
        </section>

        {error && <div className="error-banner">{error}</div>}

        <section className="panels">
          <article className="panel">
            <div className="panel-header">
              <h2>Requete</h2>
              <div className="tabs">
                <button type="button" className={requestTab === "headers" ? "active" : ""} onClick={() => setRequestTab("headers")}>
                  Headers
                </button>
                <button type="button" className={requestTab === "body" ? "active" : ""} onClick={() => setRequestTab("body")}>
                  Body
                </button>
              </div>
            </div>

            {requestTab === "headers" ? (
              <div className="headers-editor">
                <datalist id="header-name-suggestions">
                  {HEADER_NAME_SUGGESTIONS.map((headerName) => (
                    <option key={headerName} value={headerName} />
                  ))}
                </datalist>
                {activeRequest.headers.map((header) => (
                  <div className="header-row" key={header.id}>
                    <datalist id={`header-value-suggestions-${header.id}`}>
                      {getHeaderValueSuggestions(header.key).map((headerValue) => (
                        <option key={headerValue} value={headerValue} />
                      ))}
                    </datalist>
                    <input
                      list="header-name-suggestions"
                      placeholder="Header"
                      value={header.key}
                      onChange={(event) => updateHeader(header.id, { key: event.target.value })}
                    />
                    <input
                      list={`header-value-suggestions-${header.id}`}
                      placeholder="Valeur"
                      value={header.value}
                      onChange={(event) => updateHeader(header.id, { value: event.target.value })}
                    />
                    <button type="button" aria-label="Supprimer le header" onClick={() => removeHeader(header.id)}>
                      X
                    </button>
                  </div>
                ))}
                <button type="button" className="add-row" onClick={addHeader}>
                  Ajouter un header
                </button>
              </div>
            ) : (
              <div className="body-editor">
                <div className="editor-toolbar">
                  <span>Body texte libre</span>
                  <button type="button" onClick={formatRequestBody}>
                    Formater JSON
                  </button>
                </div>
                <textarea
                  spellCheck="false"
                  placeholder={'{\n  "name": "ReqLab"\n}'}
                  value={activeRequest.body}
                  onChange={(event) => updateActive({ body: event.target.value })}
                />
              </div>
            )}
          </article>

          <article className="panel response-panel">
            <div className="panel-header">
              <h2>Reponse</h2>
              <label className="pretty-toggle">
                <input type="checkbox" checked={prettyJson} onChange={(event) => setPrettyJson(event.target.checked)} />
                Pretty JSON
              </label>
            </div>

            <div className="response-summary">
              <Metric label="Status" value={response ? `${response.status} ${response.statusText}` : "-"} tone={response?.ok ? "good" : response ? "bad" : ""} />
              <Metric label="Temps" value={response ? `${response.elapsedMs} ms` : "-"} />
              <Metric label="Taille" value={response ? `${response.size} o` : "-"} />
            </div>

            <div className="tabs response-tabs">
              <button type="button" className={responseTab === "body" ? "active" : ""} onClick={() => setResponseTab("body")}>
                Body
              </button>
              <button type="button" className={responseTab === "headers" ? "active" : ""} onClick={() => setResponseTab("headers")}>
                Headers
              </button>
            </div>

            <pre className="response-output">
              {response
                ? responseTab === "body"
                  ? responseBody || "(reponse vide)"
                  : JSON.stringify(response.headers, null, 2)
                : "Envoyez une requete pour afficher la reponse."}
            </pre>
          </article>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="theme-icon">
      <path d="M20.2 15.2a7.3 7.3 0 0 1-8.9-8.9 7.7 7.7 0 1 0 8.9 8.9Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="theme-icon">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="theme-icon">
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="theme-icon">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export default App;
