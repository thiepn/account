import { describe, expect, it } from "vitest";
import { validateReturnTo } from "./returnTo";

describe("validateReturnTo",()=>{
  it("preserves safe internal Account routes",()=>{
    expect(validateReturnTo("/data/backups?x=1#history")).toBe("/data/backups?x=1#history");
  });
  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/auth/callback",
    "/auth/sign-in",
    "javascript:alert(1)",
    "",
  ])("rejects unsafe return target %s",(value)=>{
    expect(validateReturnTo(value)).toBe("/");
  });
});
