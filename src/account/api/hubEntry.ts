// A tokenless launch request: the verifier and resulting session stay on Hub.
export const HUB_HOME = "https://thiepn.dev/home/";
export function validateHubAuthorization(value: unknown, issuer: unknown): string | null {
  try {
    if (typeof value !== "string" || value.length > 4096 || issuer !== "https://hycegznamzjhwinegaai.supabase.co") return null;
    const url = new URL(value);
    if (url.origin !== issuer || url.pathname !== "/auth/v1/authorize" || url.username || url.password || url.hash) return null;
    const allowed = ["provider", "redirect_to", "code_challenge", "code_challenge_method", "prompt"];
    if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return null;
    if (url.searchParams.get("provider") !== "google" || url.searchParams.get("code_challenge_method")?.toLowerCase() !== "s256" || url.searchParams.get("prompt") !== "select_account") return null;
    if (!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") ?? "")) return null;
    const redirect = new URL(url.searchParams.get("redirect_to") ?? "");
    if (redirect.origin !== "https://thiepn.dev" || redirect.pathname !== "/home/auth/callback/" || redirect.username || redirect.password || redirect.hash) return null;
    if ([...redirect.searchParams.keys()].join() !== "flow" || !/^[a-f0-9]{64}$/.test(redirect.searchParams.get("flow") ?? "")) return null;
    return url.href;
  } catch { return null; }
}
export function getHubAuthorizationRequest() {
  const query = new URLSearchParams(window.location.search);
  const request = query.getAll("request").length === 1 ? query.get("request") : null;
  return validateHubAuthorization(request, import.meta.env.VITE_SUPABASE_URL);
}
