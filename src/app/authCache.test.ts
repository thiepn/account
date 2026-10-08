import {describe,expect,it} from "vitest";
import {mustDiscardProtectedQueries} from "./authCache";

describe("Account protected-query cache isolation",()=>{
  it("drops private results on sign-out and expired sessions",()=>{
    expect(mustDiscardProtectedQueries("user-a","signed-out")).toBe(true);
    expect(mustDiscardProtectedQueries("user-a","session-expired")).toBe(true);
  });
  it("drops previous user's data on a direct Google account switch",()=>{
    expect(mustDiscardProtectedQueries("user-a","signed-in","user-b")).toBe(true);
  });
  it("fails closed when a previously established identity becomes unknown",()=>{
    expect(mustDiscardProtectedQueries("user-a","signed-in")).toBe(true);
  });
  it("does not clear on same-account refresh or initial session",()=>{
    expect(mustDiscardProtectedQueries("user-a","signed-in","user-a")).toBe(false);
    expect(mustDiscardProtectedQueries(null,"signed-in","user-a")).toBe(false);
  });
});
