import type { AccountDeletionPlan, AccountDeletionRequest, AccountProfile, AppCloudDataDetail, AppDataDeletionOperation, AppDataDeletionPlan, ConnectedAppSummary, ExportRequest, PrivacySummary } from "../types";
import type { PrivacyService } from "../service";

const KEY="thiepn.account.mock.privacy.v1";
interface StoredState {
  version:1; scenario:string; exports:(ExportRequest&{content?:string})[];
  appPlans:AppDataDeletionPlan[]; appOperations:AppDataDeletionOperation[];
  accountPlans:AccountDeletionPlan[]; accountDeletion?:AccountDeletionRequest;
}
interface Context {
  scenario:string;
  getProfile:()=>AccountProfile;
  getApps:()=>ConnectedAppSummary[];
  getAppData:()=>AppCloudDataDetail[];
  setAppData:(items:AppCloudDataDetail[])=>void;
  getBackupCount:()=>number;
  getAccountStatus:()=> "active"|"restricted"|"deletion-pending";
  setAccountStatus:(status:"active"|"restricted"|"deletion-pending")=>void;
  addSecurityEvent:(title:string,description:string,type:string)=>void;
}
const id=(prefix:string)=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const now=()=>new Date().toISOString();

export function createMockPrivacyService(ctx:Context):PrivacyService{
  const load=():StoredState=>{try{const value=JSON.parse(localStorage.getItem(KEY)??"") as StoredState;if(value.version===1&&value.scenario===ctx.scenario)return value;}catch{}return {version:1,scenario:ctx.scenario,exports:[],appPlans:[],appOperations:[],accountPlans:[]};};
  let state=load();
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(state));
  function advanceExports(){
    let changed=false;
    state.exports=state.exports.map((request)=>{
      if(["ready","failed","expired"].includes(request.status))return request;
      const elapsed=Date.now()-new Date(request.requestedAt).getTime();
      const status:ExportRequest["status"]=elapsed<400?"collecting":elapsed<900?"packaging":"ready";
      if(status==="ready"){
        const expiresAt=new Date(Date.now()+24*60*60_000).toISOString();
        changed=true;
        return {...request,status,completedAt:now(),expiresAt,sizeBytes:JSON.stringify(request.content??"").length};
      }
      return {...request,status};
    }).map((request)=>request.expiresAt&&new Date(request.expiresAt).getTime()<=Date.now()?{...request,status:"expired" as const}:request);
    if(changed)persist();
  }
  return {
    async getSummary(){advanceExports();const appData=ctx.getAppData();const deletion=state.accountDeletion;return {exportCount:state.exports.length,readyExportCount:state.exports.filter((item)=>item.status==="ready").length,storedAppCount:appData.length,retainedAppCount:appData.filter((item)=>item.namespaceStatus==="retained").length,accountStatus:ctx.getAccountStatus(),accountDeletion:deletion} satisfies PrivacySummary;},
    async requestExport(appIds){
      advanceExports();
      const selected=appIds?.length?ctx.getAppData().filter((item)=>appIds.includes(item.appId)):ctx.getAppData();
      const request:ExportRequest&{content?:string}={id:id("exp"),scope:appIds?.length?"selected-apps":"account",appIds:appIds?.length?[...appIds]:undefined,status:"queued",requestedAt:now(),content:JSON.stringify({schema:"thiepn-account-export",version:1,exportedAt:now(),profile:ctx.getProfile(),apps:ctx.getApps(),cloudData:selected.map((item)=>({appId:item.appId,appName:item.appName,namespaceStatus:item.namespaceStatus,generation:item.generation,revision:item.revision,storageBytes:item.storageBytes}))},null,2)};
      state.exports=[request,...state.exports];persist();ctx.addSecurityEvent("Data export requested","A THIEPN Account data export was requested.","DATA_EXPORT_REQUESTED");return request;
    },
    async listExports(){advanceExports();return state.exports.map(({content:_,...request})=>request);},
    async getExport(exportId){advanceExports();const item=state.exports.find((request)=>request.id===exportId);if(!item)return null;const {content:_,...request}=item;return request;},
    async getExportContent(exportId){advanceExports();const item=state.exports.find((request)=>request.id===exportId);if(!item||item.status!=="ready"||!item.content)throw new Error("EXPORT_NOT_READY");return item.content;},
    async planAppDataDeletion(appId){
      const item=ctx.getAppData().find((entry)=>entry.appId===appId);if(!item)throw new Error("APP_DATA_NOT_FOUND");
      const plan:AppDataDeletionPlan={id:id("dplan"),appId,appName:item.appName,storageBytes:item.storageBytes,blockers:[],warnings:["Local app data on your devices is not erased by this cloud deletion."],backupImpact:"Historical mock backups are retained. Ordinary restore must not silently resurrect intentionally deleted data.",requiresReauthentication:true,expiresAt:new Date(Date.now()+10*60_000).toISOString()};
      state.appPlans=[plan,...state.appPlans];persist();return plan;
    },
    async startAppDataDeletion(planId){
      const plan=state.appPlans.find((item)=>item.id===planId);if(!plan)throw new Error("DELETION_PLAN_NOT_FOUND");if(new Date(plan.expiresAt).getTime()<=Date.now())throw new Error("DELETION_PLAN_STALE");if(plan.blockers.length)throw new Error("DELETION_BLOCKED");
      const operation:AppDataDeletionOperation={id:id("adel"),appId:plan.appId,status:"deleting-live-data",startedAt:now()};state.appOperations=[operation,...state.appOperations];persist();
      await new Promise((resolve)=>setTimeout(resolve,650));
      ctx.setAppData(ctx.getAppData().filter((item)=>item.appId!==plan.appId));
      const completed={...operation,status:"completed" as const,completedAt:now()};state.appOperations=state.appOperations.map((item)=>item.id===operation.id?completed:item);persist();ctx.addSecurityEvent(`${plan.appName} cloud data deleted`,"Live cloud data was deleted. The app connection was not disconnected.","APP_DATA_DELETED");return completed;
    },
    async planAccountDeletion(){
      const plan:AccountDeletionPlan={id:id("acctplan"),appCount:ctx.getApps().length,namespaceCount:ctx.getAppData().length,backupCount:ctx.getBackupCount(),blockers:[],warnings:["The mock lifecycle uses a seven-day grace period. No irreversible production deletion is performed by this frontend."],gracePeriodDays:7,requiresReauthentication:true,expiresAt:new Date(Date.now()+10*60_000).toISOString()};
      state.accountPlans=[plan,...state.accountPlans];persist();return plan;
    },
    async requestAccountDeletion(planId,confirmation){
      const plan=state.accountPlans.find((item)=>item.id===planId);if(!plan)throw new Error("DELETION_PLAN_NOT_FOUND");if(new Date(plan.expiresAt).getTime()<=Date.now())throw new Error("DELETION_PLAN_STALE");if(confirmation!=="DELETE")throw new Error("CONFIRMATION_MISMATCH");
      if(state.accountDeletion?.status==="pending")return state.accountDeletion;
      const deadline=new Date(Date.now()+plan.gracePeriodDays*86_400_000).toISOString();
      const request:AccountDeletionRequest={id:id("acdel"),status:"pending",requestedAt:now(),cancellableUntil:deadline,scheduledDeletionAt:deadline};
      state={...state,accountDeletion:request};persist();ctx.setAccountStatus("deletion-pending");ctx.addSecurityEvent("Account deletion scheduled","THIEPN Account deletion was scheduled with a cancellable grace period.","ACCOUNT_DELETION_REQUESTED");return request;
    },
    async getAccountDeletion(){return state.accountDeletion??null;},
    async cancelAccountDeletion(){
      if(!state.accountDeletion||state.accountDeletion.status!=="pending")throw new Error("NO_CANCELLABLE_DELETION");
      if(state.accountDeletion.cancellableUntil&&new Date(state.accountDeletion.cancellableUntil).getTime()<=Date.now())throw new Error("DELETION_NO_LONGER_CANCELLABLE");
      const cancelled={...state.accountDeletion,status:"cancelled" as const,completedAt:now()};state={...state,accountDeletion:cancelled};persist();ctx.setAccountStatus("active");ctx.addSecurityEvent("Account deletion cancelled","The scheduled THIEPN Account deletion was cancelled.","ACCOUNT_DELETION_CANCELLED");return cancelled;
    },
  };
}
