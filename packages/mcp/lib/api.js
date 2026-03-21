const API_URL = process.env.CHINWAG_API_URL || 'https://chinwag-api.glendonchin.workers.dev';

export function api(config) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'chinwag-mcp/1.0',
  };

  if (config?.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  async function request(method, path, body = null) {
    const opts = { method, headers: { ...headers } };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_URL}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
  };
}
