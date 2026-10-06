import { describe, expect, it } from "vitest";
import {
  getJapaneseAuthorizationRequest,
  validateJapaneseAuthorization,
} from "./japaneseEntry";

const issuer = "https://hycegznamzjhwinegaai.supabase.co";
const valid = () => {
  const url = new URL(`${issuer}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set(
    "redirect_to",
    `https://thiepn.dev/japanese/auth/callback/?flow=${"a".repeat(64)}`,
  );
  url.searchParams.set("code_challenge", "b".repeat(43));
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("prompt", "select_account");
  return url;
};

describe("Japanese tokenless Account entry boundary", () => {
  it("accepts only the supported Japanese PKCE launch", () => {
    expect(validateJapaneseAuthorization(valid().href, issuer)).toBe(valid().href);
  });

  it("rejects unknown, duplicate and fragment fields on the outer request", () => {
    for (const suffix of ["&extra=1", "&request=duplicate", "#fragment"]) {
      window.history.replaceState(
        null,
        "",
        `/japanese/entry?request=${encodeURIComponent(valid().href)}${suffix}`,
      );
      expect(getJapaneseAuthorizationRequest()).toBeNull();
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
    expect(validateJapaneseAuthorization(url.href, issuer)).toBeNull();
  });

  it.each([
    "https://evil.test/",
    "https://thiepn.dev.evil.test/japanese/auth/callback/",
    "https://thiepn.dev/japanese/auth/callback/?flow=x",
    `https://thiepn.dev/japanese/auth/callback/?flow=${"a".repeat(64)}&flow=${"a".repeat(64)}`,
    "https://thiepn.dev/japanese/",
    `https://thiepn.dev/japanese/auth/callback/?flow=${"a".repeat(64)}#token`,
  ])("rejects unsafe callback %s", redirect => {
    const url = valid();
    url.searchParams.set("redirect_to", redirect);
    expect(validateJapaneseAuthorization(url.href, issuer)).toBeNull();
  });

  it.each(["access_token", "refresh_token", "scopes", "redirect_uri"])(
    "rejects unsupported request field %s",
    key => {
      const url = valid();
      url.searchParams.set(key, "x");
      expect(validateJapaneseAuthorization(url.href, issuer)).toBeNull();
    },
  );

  it("rejects duplicate provider, plain PKCE, credentials, fragments and wrong project config", () => {
    for (const mutate of [
      (url: URL) => url.searchParams.append("provider", "google"),
      (url: URL) => url.searchParams.set("code_challenge_method", "plain"),
      (url: URL) => { url.username = "x"; },
      (url: URL) => { url.hash = "x"; },
    ]) {
      const url = valid();
      mutate(url);
      expect(validateJapaneseAuthorization(url.href, issuer)).toBeNull();
    }
    expect(
      validateJapaneseAuthorization(
        valid().href,
        "https://other.supabase.co",
      ),
    ).toBeNull();
  });
});
