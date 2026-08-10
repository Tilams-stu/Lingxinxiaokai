/* Shared, deliberately small client for the two legacy chat pages. */
(function () {
  function friendlyError(response, data) {
    if (response.status === 401) return '登录已失效，请重新登录。';
    if (response.status === 429) return '操作过于频繁，请稍后再试。';
    return data && data.message ? data.message : `服务暂时不可用（${response.status}）`;
  }

  async function json(path, options) {
    let response;
    try {
      response = await fetch(path, {
        credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
    } catch (_) {
      throw new Error('无法连接服务，请确认后端已启动。');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(friendlyError(response, data));
    return data;
  }

  async function stream(payload, onEvent) {
    let response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } catch (_) {
      throw new Error('无法连接服务，请确认后端已启动。');
    }
    if (!response.ok) throw new Error(friendlyError(response, await response.json().catch(() => ({}))));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        if (!frame.startsWith('data:')) continue;
        try { onEvent(JSON.parse(frame.slice(5).trim())); } catch (_) {}
      }
    }
  }

  window.LXChat = { json, stream };
})();
