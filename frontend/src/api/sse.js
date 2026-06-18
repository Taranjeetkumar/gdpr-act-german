import { auth } from '../firebase';

// Native EventSource can't attach an Authorization header, and every other
// endpoint in this app needs one. So instead of switching just this one
// endpoint to a different auth scheme, this reads Server-Sent Events
// manually with fetch + a streaming reader.
//
// Returns an unsubscribe function. onEvent(eventName, parsedData) fires for
// every `event: ...\ndata: ...` block the server sends.
export function openSse(path, onEvent, onError) {
  const controller = new AbortController();
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  (async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${baseURL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by a blank line
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop(); // keep the trailing partial block for next read

        for (const block of blocks) {
          if (!block.trim() || block.startsWith(':')) continue; // comments/heartbeats
          let eventName = 'message';
          let dataLine = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataLine = line.slice(6);
          }
          if (dataLine) {
            try {
              onEvent(eventName, JSON.parse(dataLine));
            } catch {
              // ignore malformed frame
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    }
  })();

  return () => controller.abort();
}
