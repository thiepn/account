import type { AppCloudDataDetail, BackupOperation, BackupPolicy, BackupSnapshot, RestoreOperation, RestorePlan } from "../types";
import type { BackupService } from "../service";

const KEY="thiepn.account.mock.backup.v1";
interface StoredState {
  version:1; scenario:string; backups:BackupSnapshot[]; policy:BackupPolicy;
  operations:(BackupOperation&{finalized?:boolean})[];
  restorePlans:RestorePlan[];
  restores:(RestoreOperation&{applied?:boolean})[];
}
interface Context {
  scenario:string;
  getAppData:()=>AppCloudDataDetail[];
  setAppData:(items:AppCloudDataDetail[])=>void;
  addSecurityEvent:(title:string,description:string,type:string)=>void;
}
const now=()=>new Date().toISOString();
const id=(prefix:string)=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

function snapshotFrom(items:AppCloudDataDetail[],type:BackupSnapshot["type"],backupId=id("bkp")):BackupSnapshot{
  return {id:backupId,createdAt:now(),status:"verified",type,destination:{type:"mock",label:"Mock recovery storage"},sizeBytes:items.reduce((sum,item)=>sum+item.storageBytes,0),manifestVersion:1,integrity:{status:"verified",verifiedAt:now()},apps:items.map((item)=>({appId:item.appId,appName:item.appName,namespaceId:item.namespaceId,sourceGeneration:item.generation,sourceRevision:item.revision,schemaVersion:item.schemaVersion,sizeBytes:item.storageBytes}))};
}

export function createMockBackupService(ctx:Context):BackupService{
  const load=():StoredState=>{
    try{const parsed=JSON.parse(localStorage.getItem(KEY)??"") as StoredState;if(parsed.version===1&&parsed.scenario===ctx.scenario)return parsed;}catch{}
    const current=ctx.getAppData();
    const seed=ctx.scenario==="new-account"?[]:[snapshotFrom(current,"automatic","bkp_seed_verified")];
    return {version:1,scenario:ctx.scenario,backups:seed,policy:{enabled:true,frequency:"daily",includedApps:current.map((item)=>item.appId)},operations:[],restorePlans:[],restores:[]};
  };
  let state=load();
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(state));

  function advance(){
    const time=Date.now();
    let changed=false;
    state.operations=state.operations.map((operation)=>{
      if(operation.finalized||operation.status==="failed"||operation.status==="completed")return operation;
      const elapsed=time-new Date(operation.startedAt).getTime();
      let status:BackupOperation["status"]=elapsed<500?"collecting":elapsed<1000?"writing":elapsed<1500?"verifying":"completed";
      if(ctx.scenario==="backup-failed"&&elapsed>=900)status="failed";
      if(status==="completed"){
        const selected=ctx.getAppData().filter((item)=>state.policy.includedApps.includes(item.appId));
        const backup=snapshotFrom(selected,"manual");
        state.backups=[backup,...state.backups];
        changed=true;
        ctx.addSecurityEvent("Backup created","A manual THIEPN Account backup was created and verified.","BACKUP_CREATED");
        return {...operation,status,backupId:backup.id,completedAt:now(),finalized:true};
      }
      if(status==="failed"){changed=true;return {...operation,status,completedAt:now(),finalized:true};}
      return {...operation,status};
    });
    state.restores=state.restores.map((operation)=>{
      if(operation.applied||["failed","completed","partially-completed","cancelled"].includes(operation.status))return operation;
      const elapsed=time-new Date(operation.startedAt).getTime();
      let status:RestoreOperation["status"]=elapsed<700?"creating-safety-snapshot":elapsed<1500?"restoring":elapsed<2200?"verifying":"completed";
      if(status==="completed"){
        const backup=state.backups.find((item)=>item.id===operation.backupId);
        if(!backup)return {...operation,status:"failed" as const,completedAt:now(),applied:true};
        const selected=new Set(operation.selectedApps);
        const results:RestoreOperation["appResults"]=[];
        const next=ctx.getAppData().map((item)=>{
          if(!selected.has(item.appId))return item;
          const source=backup.apps.find((entry)=>entry.appId===item.appId);
          if(!source){results.push({appId:item.appId,status:"failed",verified:false,errorCode:"APP_NOT_IN_BACKUP"});return item;}
          const newGeneration=item.generation+1;
          results.push({appId:item.appId,status:"restored",verified:true,newGeneration});
          return {...item,generation:newGeneration,revision:1,updatedAt:now(),sync:{...item.sync,status:"pending" as const,lastDataChangeAt:now(),pendingChanges:0,error:undefined},clients:item.clients.map((client)=>({...client,status:"reconciliation-required" as const}))};
        });
        ctx.setAppData(next);
        changed=true;
        ctx.addSecurityEvent("Restore completed","Selected app cloud-data namespaces were restored from a verified snapshot.","RESTORE_COMPLETED");
        return {...operation,status:"completed" as const,completedAt:now(),appResults:results,applied:true};
      }
      return {...operation,status};
    });
    if(changed)persist();
  }

  return {
    async getSummary(){advance();const active=state.operations.find((item)=>!["completed","failed"].includes(item.status));return {lastSuccessful:state.backups.find((item)=>item.status==="verified"),activeOperation:active,policy:{...state.policy},attention:ctx.scenario==="backup-failed"?"The latest backup attempt failed.":undefined};},
    async listBackups(){advance();return [...state.backups];},
    async getBackup(backupId){advance();return state.backups.find((item)=>item.id===backupId)??null;},
    async createBackup(){advance();const existing=state.operations.find((item)=>!["completed","failed"].includes(item.status));if(existing)return existing;const operation:BackupOperation={id:id("bop"),status:"queued",startedAt:now()};state.operations=[operation,...state.operations];persist();return operation;},
    async getPolicy(){return {...state.policy};},
    async updatePolicy(input){state={...state,policy:{...input}};persist();return {...state.policy};},
    async planRestore(backupId,selectedApps){
      advance();const backup=state.backups.find((item)=>item.id===backupId);if(!backup)throw new Error("BACKUP_NOT_FOUND");
      const blockers=backup.status!=="verified"?["Backup is not verified."]:[];
      const valid=selectedApps.filter((appId)=>backup.apps.some((item)=>item.appId===appId));
      if(!valid.length)blockers.push("Select at least one app to restore.");
      const warnings=valid.some((appId)=>{const live=ctx.getAppData().find((item)=>item.appId===appId);const snap=backup.apps.find((item)=>item.appId===appId);return Boolean(live&&snap&&live.revision>snap.sourceRevision);})?["Current cloud data is newer than this backup."]:[];
      const plan:RestorePlan={id:id("rplan"),backupId,selectedApps:valid,blockers,warnings,safetySnapshotRequired:true,requiresReauthentication:true,expiresAt:new Date(Date.now()+10*60_000).toISOString()};
      state={...state,restorePlans:[plan,...state.restorePlans]};persist();return plan;
    },
    async startRestore(planId){
      advance();const plan=state.restorePlans.find((item)=>item.id===planId);if(!plan)throw new Error("RESTORE_PLAN_NOT_FOUND");
      if(new Date(plan.expiresAt).getTime()<=Date.now())throw new Error("RESTORE_PLAN_EXPIRED");
      if(plan.blockers.length)throw new Error("RESTORE_BLOCKED");
      const active=state.restores.find((item)=>!["completed","partially-completed","failed","cancelled"].includes(item.status));if(active)return active;
      const safety=snapshotFrom(ctx.getAppData().filter((item)=>plan.selectedApps.includes(item.appId)),"pre-restore");
      state.backups=[safety,...state.backups];
      const operation:RestoreOperation&{applied?:boolean}={id:id("rst"),backupId:plan.backupId,selectedApps:[...plan.selectedApps],status:"planning",startedAt:now(),safetyBackupId:safety.id};
      state.restores=[operation,...state.restores];persist();ctx.addSecurityEvent("Restore started","A controlled cloud-data restore started after creating a safety snapshot.","RESTORE_STARTED");return operation;
    },
    async getRestoreOperation(operationId){advance();return state.restores.find((item)=>item.id===operationId)??null;},
  };
}
