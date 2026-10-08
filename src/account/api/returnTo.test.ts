import { describe, expect, it } from "vitest";
import { consumeReturnTo, saveReturnTo, validateReturnTo } from "./returnTo";

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

describe("Account OAuth return-to storage resilience",()=>{
  const denied={
    getItem:()=>{throw new DOMException("Access denied","SecurityError");},
    setItem:()=>{throw new DOMException("Access denied","SecurityError");},
    removeItem:()=>{throw new DOMException("Access denied","SecurityError");},
  } as unknown as Storage;
  it("safely falls back to Account overview when browsers block sessionStorage",()=>{
    expect(saveReturnTo("/data/backups",denied)).toBe(false);
    expect(consumeReturnTo(denied)).toBe("/");
  });
  it("stores only internal validated routes and consumes the value once",()=>{
    const data=new Map<string,string>();
    const memory={
      getItem:(key:string)=>data.get(key)??null,
      setItem:(key:string,value:string)=>{data.set(key,value);},
      removeItem:(key:string)=>{data.delete(key);},
    } as unknown as Storage;
    expect(saveReturnTo("//evil.test/",memory)).toBe(true);
    expect(consumeReturnTo(memory)).toBe("/");
    expect(saveReturnTo("/apps/library?view=security#grants",memory)).toBe(true);
    expect(consumeReturnTo(memory)).toBe("/apps/library?view=security#grants");
    expect(consumeReturnTo(memory)).toBe("/");
  });
});
