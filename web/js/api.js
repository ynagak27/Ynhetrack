// Talks to the Worker API. The Worker URL and token live only in this phone's localStorage.

const KEY = 'ynhetrack.connection';

export function getConnection() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && c.url && c.token) return c;
  } catch {
    /* ignore corrupt or blocked storage */
  }
  return null;
}

export function setConnection(url, token) {
  localStorage.setItem(KEY, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), token: token.trim() }));
}

export class ApiError extends Error {}

async function request(method, path, { json, text, accept = 'json' } = {}) {
  const conn = getConnection();
  if (!conn) throw new ApiError('Set up the connection in Settings first.');
  const headers = { Authorization: `Bearer ${conn.token}` };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (text !== undefined) {
    headers['Content-Type'] = 'text/csv';
    body = text;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(conn.url + path, { method, headers, body, signal: ctrl.signal });
  } catch {
    throw new ApiError(navigator.onLine === false ? 'You’re offline — not saved.' : 'Can’t reach the Worker — not saved.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* not JSON */
    }
    if (res.status === 401) msg = 'Wrong API token — check Settings.';
    throw new ApiError(msg);
  }
  return accept === 'blob' ? res.blob() : res.json();
}

export const api = {
  getRange: (from, to) => request('GET', `/api/days?from=${from}&to=${to}`),
  saveDays: (timezone, days) => request('PUT', '/api/days', { json: { timezone, days } }),
  importWeights: (csv, timezone) =>
    request('POST', `/api/import/weights?tz=${encodeURIComponent(timezone)}`, { text: csv }),
  exportCsv: () => request('GET', '/api/export.csv', { accept: 'blob' }),
  settings: () => request('GET', '/api/settings'),
};
