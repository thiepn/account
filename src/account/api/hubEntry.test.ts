import { describe, expect, it } from "vitest";
import { validateHubAuthorization } from "./hubEntry";
const issuer="https://hycegznamzjhwinegaai.supabase.co";
const valid=()=>{const u=new URL(`${issuer}/auth/v1/authorize`);u.searchParams.set("provider","google");u.searchParams.set("redirect_to",`https://thiepn.dev/home/auth/callback/?flow=${"a".repeat(64)}`);u.searchParams.set("code_challenge","b".repeat(43));u.searchParams.set("code_challenge_method","s256");u.searchParams.set("prompt","select_account");return u;};
describe("Hub tokenless entry boundary",()=>{
  it("accepts only the supported Hub PKCE launch",()=>expect(validateHubAuthorization(valid().href,issuer)).toBe(valid().href));
  it.each(["https://evil.test","https://hycegznamzjhwinegaai.supabase.co.evil.test","http://hycegznamzjhwinegaai.supabase.co"])("rejects an alternate issuer %s",origin=>{const u=valid();u.host=new URL(origin).host;u.protocol=new URL(origin).protocol;expect(validateHubAuthorization(u.href,issuer)).toBeNull();});
  it.each(["https://evil.test/","https://thiepn.dev.evil.test/home/auth/callback/","https://thiepn.dev/home/auth/callback/?flow=x","https://thiepn.dev/home/auth/callback/?flow="+"a".repeat(64)+"&flow="+"a".repeat(64),"https://thiepn.dev/notes/","https://thiepn.dev/home/auth/callback/?flow="+"a".repeat(64)+"#token"])("rejects unsafe callback %s",redirect=>{const u=valid();u.searchParams.set("redirect_to",redirect);expect(validateHubAuthorization(u.href,issuer)).toBeNull();});
  it.each(["access_token","refresh_token","scopes","redirect_uri"])("rejects unsupported request field %s",key=>{const u=valid();u.searchParams.set(key,"x");expect(validateHubAuthorization(u.href,issuer)).toBeNull();});
  it("rejects duplicate fields, plain PKCE, credentials, fragments and wrong project config",()=>{for(const mutate of [(u:URL)=>u.searchParams.append("provider","google"),(u:URL)=>u.searchParams.set("code_challenge_method","plain"),(u:URL)=>{u.username="x";},(u:URL)=>{u.hash="x";}]){const u=valid();mutate(u);expect(validateHubAuthorization(u.href,issuer)).toBeNull();}expect(validateHubAuthorization(valid().href,"https://other.supabase.co")).toBeNull();});
});
