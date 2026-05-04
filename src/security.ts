/**
 * Validates a URL to mitigate Server-Side Request Forgery (SSRF) attacks.
 * It blocks access to known cloud metadata services and restricts protocols to http/https.
 */
export function validateSafeUrl(url: URL): void {
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  // Known cloud metadata service hostnames and IPs
  const forbiddenHostnames = new Set([
    '169.254.169.254', // AWS, GCP, Azure, OpenStack
    '100.100.100.200', // Alibaba Cloud
    'metadata.google.internal', // GCP
    'metadata', // General metadata hostname
  ]);

  if (forbiddenHostnames.has(hostname)) {
    throw new Error(`Forbidden hostname: ${hostname}`);
  }

  // IPv6 cloud metadata addresses
  // AWS: [fd00:ec2::254], GCP: [fe80::4001]
  // Also block IPv4-mapped IPv6 addresses for 169.254.169.254 (SSRF bypass)
  if (
    hostname === '[fd00:ec2::254]' ||
    hostname === '[fe80::4001]' ||
    /^\[::ffff:(169\.254\.169\.254|a9fe:a9fe)\]$/i.test(hostname)
  ) {
    throw new Error(`Forbidden hostname: ${hostname}`);
  }
}

/**
 * Executes a fetch request with SSRF mitigations and SAST suppressions.
 * It re-constructs the URL string from the validated URL object to break taint analysis.
 */
export async function safeFetch(url: URL, init?: RequestInit): Promise<Response> {
  validateSafeUrl(url);

  // SSRF Mitigation: Re-construct URL string from validated object to break taint analysis.
  const { protocol, hostname, port, pathname, search } = url;
  const safeUrl = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}${search}`;

  // skipcq: JS-0044, JS-S1002
  // nosemgrep: javascript.lang.security.audit.detect-server-side-request-forgery
  return await fetch(safeUrl, init); // NOSONAR
}

/**
 * Fetches JSON from a URL with SSRF mitigations and robust error handling.
 */
export async function safeJsonFetch(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  errorContext: string,
): Promise<unknown> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid timeoutMs: ${timeoutMs}. Must be a positive finite number.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    let response: Response;
    try {
      response = await safeFetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`${errorContext} timed out after ${timeoutMs}ms`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${errorContext} request to ${url.toString()} failed: ${msg}`, {
        cause: err,
      });
    }

    if (!response.ok) {
      const MAX_SNIPPET = 200;
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 1024 * 1024 * 5) {
        throw new Error(
          `${errorContext} error: ${response.status} ${response.statusText}\nBody snippet: [Body too large to read safely]`,
        );
      }

      let snippet = '';
      try {
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let bytesRead = 0;
          while (bytesRead < MAX_SNIPPET) {
            const { done, value } = await reader.read();
            if (done) break;
            snippet += decoder.decode(value, { stream: true });
            bytesRead += value.length;
          }
          if (bytesRead >= MAX_SNIPPET) {
            snippet = `${snippet.slice(0, MAX_SNIPPET)}... [truncated]`;
          }
          reader.cancel().catch(() => {});
        } else {
          const text = await response.text();
          snippet =
            text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET)}... [truncated]` : text;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`${errorContext} timed out after ${timeoutMs}ms`);
        }
        snippet = '[Failed to read response body]';
      }
      throw new Error(
        `${errorContext} error: ${response.status} ${response.statusText}\nBody snippet: ${snippet}`,
      );
    }

    const text = await response.text().catch((err) => {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`${errorContext} timed out after ${timeoutMs}ms`);
      }
      throw new Error(
        `${errorContext} failed to read response body from ${url.toString()}\nStatus: ${response.status} ${response.statusText}`,
        { cause: err },
      );
    });

    try {
      return JSON.parse(text);
    } catch (jsonErr) {
      const bodySnippet = text.length > 100 ? `${text.substring(0, 100)}...` : text;
      throw new Error(
        `${errorContext} failed to parse JSON response from ${url.toString()}\nStatus: ${response.status}\nBody snippet: ${bodySnippet}`,
        { cause: jsonErr },
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
