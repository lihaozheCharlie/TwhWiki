import { useEffect, useRef, useState } from "react";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data as T;
}

export function useApi<T>(url: string, revision = 0): { data?: T; loading: boolean; error?: string } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const currentUrl = useRef(url);
  const hasData = useRef(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const urlChanged = currentUrl.current !== url;
    currentUrl.current = url;
    if (urlChanged) {
      hasData.current = false;
      setData(undefined);
    }
    if (!url) {
      setLoading(false);
      setError(undefined);
      return;
    }
    if (!hasData.current) setLoading(true);
    setError(undefined);
    api<T>(url, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        hasData.current = true;
        setData(result);
      })
      .catch((reason) => {
        if (active && reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, revision]);
  return { data, loading, error };
}
