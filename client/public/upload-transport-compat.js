(() => {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const MAX_MATERIALIZE_BYTES = 25 * 1024 * 1024;

  function resolveUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  function isUploadRequest(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "POST" || !(init?.body instanceof FormData)) return false;

    try {
      const url = new URL(resolveUrl(input), window.location.href);
      return url.origin === window.location.origin && (
        url.pathname === "/api/upload" ||
        url.pathname.startsWith("/api/upload/replace/")
      );
    } catch {
      return false;
    }
  }

  function parseResponseHeaders(rawHeaders) {
    const headers = new Headers();
    for (const line of String(rawHeaders || "").trim().split(/[\r\n]+/)) {
      if (!line) continue;
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
    return headers;
  }

  function sendWithXhr(input, init) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = resolveUrl(input);
      const method = String(init?.method || "POST").toUpperCase();
      let settled = false;

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        if (init?.signal && abortHandler) {
          init.signal.removeEventListener("abort", abortHandler);
        }
        callback();
      };

      const abortHandler = () => {
        try { xhr.abort(); } catch {}
      };

      xhr.open(method, url, true);
      xhr.withCredentials = init?.credentials === "include" || init?.credentials === "same-origin";
      xhr.timeout = 5 * 60 * 1000;

      const requestHeaders = new Headers(init?.headers || {});
      requestHeaders.forEach((value, key) => {
        const normalized = key.toLowerCase();
        if (normalized === "content-type" || normalized === "content-length" || normalized === "host") return;
        xhr.setRequestHeader(key, value);
      });

      xhr.onload = () => finish(() => {
        resolve(new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
        }));
      });
      xhr.onerror = () => finish(() => reject(new TypeError("Upload transport failed before the server returned an HTTP response")));
      xhr.ontimeout = () => finish(() => reject(new TypeError("Upload transport timed out before the server returned an HTTP response")));
      xhr.onabort = () => finish(() => reject(new DOMException("Upload aborted", "AbortError")));

      if (init?.signal) {
        if (init.signal.aborted) {
          abortHandler();
          return;
        }
        init.signal.addEventListener("abort", abortHandler, { once: true });
      }

      xhr.send(init?.body || null);
    });
  }

  async function materializeFormData(source) {
    const rebuilt = new FormData();
    let copiedFile = false;

    for (const [key, value] of source.entries()) {
      if (typeof value === "string") {
        rebuilt.append(key, value);
        continue;
      }

      if (!(value instanceof File)) {
        rebuilt.append(key, value);
        continue;
      }

      if (value.size > MAX_MATERIALIZE_BYTES) {
        throw new TypeError(`Browser could not stream ${value.name}; the selected file is too large for the in-memory compatibility retry`);
      }

      try {
        const bytes = await value.arrayBuffer();
        const blob = new Blob([bytes], { type: value.type || "application/octet-stream" });
        rebuilt.append(key, blob, value.name);
        copiedFile = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new TypeError(`Browser could not read the selected file ${value.name}: ${reason}`);
      }
    }

    return copiedFile ? rebuilt : null;
  }

  globalThis.fetch = async function lighthouseFetch(input, init) {
    if (!isUploadRequest(input, init)) {
      return nativeFetch(input, init);
    }

    try {
      return await sendWithXhr(input, init);
    } catch (firstError) {
      if (firstError?.name === "AbortError") throw firstError;

      const source = init?.body;
      if (!(source instanceof FormData)) throw firstError;

      console.warn("[UploadTransport] native multipart stream failed; retrying with materialized source bytes", firstError);
      const materialized = await materializeFormData(source);
      if (!materialized) throw firstError;

      return sendWithXhr(input, { ...(init || {}), body: materialized });
    }
  };
})();
