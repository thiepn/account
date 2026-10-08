import {describe,expect,it,vi} from "vitest";
import {createSingleFlight} from "./singleFlight";

describe("OAuth consent single-flight",()=>{
  it("reuses the same request for concurrent authorization IDs",async()=>{
    const run=createSingleFlight<string,string>();
    let complete:(value:string)=>void=()=>{};
    const action=vi.fn(()=>new Promise<string>(resolve=>{complete=resolve;}));
    const a=run("auth-1",action),b=run("auth-1",action);
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
    complete("approved-redirect");
    await expect(Promise.all([a,b])).resolves.toEqual(["approved-redirect","approved-redirect"]);
    expect(action).toHaveBeenCalledTimes(1);
    await expect(run("auth-1",async()=> "later")).resolves.toBe("later");
  });
  it("does not share unrelated authorizations",async()=>{
    const run=createSingleFlight<string,string>();
    await expect(Promise.all([run("a",async()=>"A"),run("b",async()=>"B")])).resolves.toEqual(["A","B"]);
  });
  it("releases failed authorizations for explicit retries",async()=>{
    const run=createSingleFlight<string,string>();
    const rejected=run("auth-x",async()=>{throw new Error("offline");});
    await expect(rejected).rejects.toThrow("offline");
    await expect(run("auth-x",async()=>"recovered")).resolves.toBe("recovered");
  });
});
