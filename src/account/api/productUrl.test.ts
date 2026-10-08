import {describe,expect,it} from "vitest";
import {safeThiepnProductUrl} from "./productUrl";

describe("THIEPN Account app launch destinations",()=>{
  it("accepts official HTTPS domains, subdomains and paths",()=>{
    expect(safeThiepnProductUrl("https://thiepn.dev/library/")).toBe("https://thiepn.dev/library/");
    expect(safeThiepnProductUrl("https://languages.thiepn.dev/")).toBe("https://languages.thiepn.dev/");
  });
  it.each([
    "http://thiepn.dev/library/",
    "https://thiepn.dev.evil.example/",
    "https://evilthiepn.dev/",
    "https://thiepn.dev@evil.example/",
    "https://thiepn.dev:4443/",
    "javascript:alert(1)",
    "https://thiepn.dev/path?next=https://evil.example",
    "https://thiepn.dev/#token",
    "//thiepn.dev/",
    null,
  ])("hides untrusted or malformed destination %s",(value)=>{
    expect(safeThiepnProductUrl(value)).toBeNull();
  });
});
