import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAccountService } from "./MockAccountService";

function serviceFor(scenario="default"){
  window.history.replaceState({}, "", `/?scenario=${scenario}`);
  return createMockAccountService();
}
async function settle<T>(promise:Promise<T>,ms:number){
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

describe("MockAccountService cross-domain invariants",()=>{
  beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-29T18:00:00Z"));});
  it("preserves the current session when signing out all other sessions",async()=>{
    const service=serviceFor();
    const before=await settle(service.devices.listSessions(),300);
    expect(before.filter((item)=>item.current)).toHaveLength(1);
    await settle(service.devices.revokeOtherSessions(),800);
    const after=await settle(service.devices.listSessions(),300);
    expect(after).toHaveLength(1);
    expect(after[0]?.current).toBe(true);
  });
  it("disconnects app access without deleting retained cloud data",async()=>{
    const service=serviceFor();
    await settle(service.apps.disconnect("tms60"),700);
    const apps=await settle(service.apps.listApps(),300);
    expect(apps.some((item)=>item.id==="tms60")).toBe(false);
    const data=await settle(service.data.getAppData("tms60"),300);
    expect(data?.namespaceStatus).toBe("retained");
    expect(data?.storageBytes).toBeGreaterThan(0);
  });
  it("does not allow an independently-required permission to be revoked",async()=>{
    const service=serviceFor();
    await expect(settle(service.apps.revokePermission("tms60","identity.basic"),600)).rejects.toMatchObject({code:"PERMISSION_REQUIRED"});
  });
  it("disabling sync preserves live cloud storage",async()=>{
    const service=serviceFor();
    const before=await settle(service.data.getAppData("tms60"),300);
    const updated=await settle(service.data.updateSyncConfiguration("tms60",false),600);
    expect(updated.sync.status).toBe("disabled");
    expect(updated.storageBytes).toBe(before?.storageBytes);
  });
  it("restore advances namespace generation and forces client reconciliation",async()=>{
    const service=serviceFor();
    const backups=await service.backup.listBackups();
    const backup=backups[0];
    expect(backup).toBeDefined();
    const beforePromise=service.data.getAppData("tms60"); const before=await settle(beforePromise,300);
    const plan=await service.backup.planRestore(backup!.id,["tms60"]);
    const operation=await service.backup.startRestore(plan.id);
    vi.advanceTimersByTime(3000);
    const completed=await service.backup.getRestoreOperation(operation.id);
    const afterPromise=service.data.getAppData("tms60"); const after=await settle(afterPromise,300);
    expect(completed?.status).toBe("completed");
    expect(after?.generation).toBe((before?.generation??0)+1);
    expect(after?.clients.every((client)=>client.status==="reconciliation-required")).toBe(true);
  });
  it("deleting app cloud data does not disconnect the app",async()=>{
    const service=serviceFor();
    const plan=await service.privacy.planAppDataDeletion("tms60");
    await settle(service.privacy.startAppDataDeletion(plan.id),800);
    const data=await settle(service.data.getAppData("tms60"),300);
    const app=await settle(service.apps.getApp("tms60"),300);
    expect(data).toBeNull();
    expect(app?.connection.status).toBe("connected");
  });
  it("scheduled Account deletion is cancellable without changing AccountId",async()=>{
    const service=serviceFor();
    const before=await settle(service.getOverview(),400);
    const plan=await service.privacy.planAccountDeletion();
    await service.privacy.requestAccountDeletion(plan.id,"DELETE");
    const pending=await settle(service.getOverview(),400);
    expect(pending.identity.status).toBe("deletion-pending");
    await service.privacy.cancelAccountDeletion();
    const after=await settle(service.getOverview(),400);
    expect(after.identity.status).toBe("active");
    expect(after.identity.accountId).toBe(before.identity.accountId);
  });
});
