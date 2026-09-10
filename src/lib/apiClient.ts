export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) },
  });
  const data: { error?: { message?: string } } | null = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Request to ${path} failed (${res.status}).`);
  }
  return data as T;
}

/**
 * Narrows a caught value to a displayable string. `catch (e)` binds `unknown`,
 * so reading `e.message` directly is both a type error and a real runtime
 * hazard — a thrown non-Error (a string, a rejected fetch) would render
 * "undefined" in the UI instead of a message.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Something went wrong.";
}
