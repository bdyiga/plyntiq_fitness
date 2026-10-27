/**
 * Better Auth includes the session token in JSON bodies (for bearer-token
 * clients). This app authenticates only via the HTTP-only cookie, so the token
 * is removed from responses: script running in the page (e.g. via XSS) must
 * never be able to read and exfiltrate a session credential.
 */
export async function stripSessionTokens(res: Response): Promise<Response> {
  if (!res.headers.get("content-type")?.includes("application/json")) return res;

  const body = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return res;

  let changed = false;
  if ("token" in body) {
    delete body.token;
    changed = true;
  }
  const session = body.session as Record<string, unknown> | undefined;
  if (session && typeof session === "object" && "token" in session) {
    delete session.token;
    changed = true;
  }
  if (!changed) return res;

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers });
}
