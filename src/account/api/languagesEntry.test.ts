import { describe, expect, it } from "vitest";
import {
  getLanguagesAuthorizationRequest,
  validateLanguagesAuthorization,
} from "./languagesEntry";

const issuer = "https://hycegznamzjhwinegaai.supabase.co";
const valid = () => {
  const url = new URL(`${issuer}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set(
    "redirect_to",
    "https://languages.thiepn.dev/auth/callback/",
  );
  url.searchParams.set("code_challenge", "b".repeat(43));
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("prompt", "select_account");
  return url;
};

describe("Languages tokenless entry boundary", () => {
  it("accepts only the supported Languages PKCE launch", () => {
    expect(validateLanguagesAuthorization(valid().href, issuer)).toBe(valid().href);
  });

  it("rejects unknown, duplicate and fragment fields on the outer request", () => {
    for (const suffix of ["&extra=1", "&request=duplicate", "#fragment"]) {
      window.history.replaceState(
        null,
        "",
        `/languages/entry?request=${encodeURIComponent(valid().href)}${suffix}`,
      );
      expect(getLanguagesAuthorizationRequest()).toBeNull();
    }
    window.history.replaceState(null, "", "/");
  });

  it.each([
    "https://evil.test",
    "https://hycegznamzjhwinegaai.supabase.co.evil.test",
    "http://hycegznamzjhwinegaai.supabase.co",
  ])("rejects alternate issuer %s", origin => {
    const url = valid();
    url.host = new URL(origin).host;
    url.protocol = new URL(origin).protocol;
    expect(validateLanguagesAuthorization(url.href, issuer)).toBeNull();
  });

  it.each([
    "https://evil.test/",
    "https://languages.thiepn.dev.evil.test/auth/callback/",
    "https://languages.thiepn.dev/auth/callback/?flow=x",
    "https://languages.thiepn.dev/auth/callback/?extra=1",
    "https://languages.thiepn.dev/auth/callback",
    "https://languages.thiepn.dev/",
    "https://languages.thiepn.dev/auth/callback/#token",
  ])("rejects unsafe callback %s", redirect => {
    const url = valid();
    url.searchParams.set("redirect_to", redirect);
    expect(validateLanguagesAuthorization(url.href, issuer)).toBeNull();
  });

  it.each(["access_token", "refresh_token", "scopes", "redirect_uri"])(
    "rejects unsupported request field %s",
    key => {
      const url = valid();
      url.searchParams.set(key, "x");
      expect(validateLanguagesAuthorization(url.href, issuer)).toBeNull();
    },
  );

  it("rejects duplicate provider, plain PKCE, credentials, fragments and wrong project config", () => {
    for (const mutate of [
      (url: URL) => url.searchParams.append("provider", "google"),
      (url: URL) => url.searchParams.set("code_challenge_method", "plain"),
      (url: URL) => {
        url.username = "x";
      },
      (url: URL) => {
        url.hash = "x";
      },
    ]) {
      const url = valid();
      mutate(url);
      expect(validateLanguagesAuthorization(url.href, issuer)).toBeNull();
    }
    expect(
      validateLanguagesAuthorization(
        valid().href,
        "https://other.supabase.co",
      ),
    ).toBeNull();
  });
});
