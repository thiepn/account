export const JAPANESE_HOME = "https://thiepn.dev/japanese/";
export const JAPANESE_CALLBACK = "https://thiepn.dev/japanese/auth/callback/";

export function validateJapaneseAuthorization(value: unknown, issuer: unknown): string | null {
  try {
    if (
      typeof value !== "string" ||
      value.length > 4096 ||
      issuer !== "https://hycegznamzjhwinegaai.supabase.co"
    ) return null;

    const url = new URL(value);
    if (
      url.origin !== issuer ||
      url.pathname !== "/auth/v1/authorize" ||
      url.username ||
      url.password ||
      url.hash
    ) return null;

    const allowed = ["provider", "redirect_to", "code_challenge", "code_challenge_method", "prompt"];
    if (
      [...url.searchParams.keys()].some(
        key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1,
      )
    ) return null;

    if (
      url.searchParams.get("provider") !== "google" ||
      url.searchParams.get("code_challenge_method")?.toLowerCase() !== "s256" ||
      url.searchParams.get("prompt") !== "select_account" ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") ?? "")
    ) return null;

    const redirect = new URL(url.searchParams.get("redirect_to") ?? "");
    if (
      redirect.origin !== "https://thiepn.dev" ||
      redirect.pathname !== "/japanese/auth/callback/" ||
      redirect.username ||
      redirect.password ||
      redirect.hash
    ) return null;
    if (
      [...redirect.searchParams.keys()].join() !== "flow" ||
      !/^[a-f0-9]{64}$/.test(redirect.searchParams.get("flow") ?? "")
    ) return null;

    return url.href;
  } catch {
    return null;
  }
}

export function getJapaneseAuthorizationRequest() {
  const query = new URLSearchParams(window.location.search);
  if (window.location.hash || [...query.keys()].join() !== "request") return null;
  const request =
    query.getAll("request").length === 1 ? query.get("request") : null;
  return validateJapaneseAuthorization(request, import.meta.env.VITE_SUPABASE_URL);
}
