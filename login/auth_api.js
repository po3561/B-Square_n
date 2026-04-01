(function () {
  'use strict';

  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: options.body != null ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error || payload?.message || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  }

  window.BSQAuthAPI = {
    requestJson,
    getJson: (path) => requestJson(path, { method: 'GET' }),
    postJson: (path, body) => requestJson(path, { method: 'POST', body }),
    putJson: (path, body) => requestJson(path, { method: 'PUT', body }),
    deleteJson: (path, body) => requestJson(path, { method: 'DELETE', body }),
  };
})();
