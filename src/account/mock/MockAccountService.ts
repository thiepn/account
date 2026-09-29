import type { AccountCapabilities, AccountError, AccountProfile, AppCloudDataDetail, AppCloudDataSummary, AppConnection, ConnectedAppDetail, ConnectedAppSummary, DataSummary, DeviceSummary, GrantedPermission, PermissionDefinition, RegisteredApp, SecurityEvent, SecuritySummary, SessionSummary } from "../types";
import type { AccountService } from "../service";
import { createMockBackupService } from "./MockBackupService";
import { createMockPrivacyService } from "./MockPrivacyService";

const STORAGE_KEY="thiepn.account.mock.v3";
type Scenario="default"|"new-account"|"many-apps"|"many-devices"|"security-warning"|"sync-problem"|"backup-failed"|"offline"|"partial-backend"|"deletion-pending"|"long-content"|"apps-empty"|"permission-request"|"connection-error"|"deprecated"|"unknown-registry"|"data-conflict"|"data-error"|"data-disabled"|"retained-data";
interface DeviceRecord {id:string;label:string;platform:string;current:boolean;firstSeenAt:string;lastActivityAt:string;}
interface MockState {version:6;scenario:Scenario;auth:"signed-out"|"signed-in"|"session-expired";profile:AccountProfile;devices:DeviceRecord[];sessions:SessionSummary[];securityEvents:SecurityEvent[];connections:AppConnection[];appData:AppCloudDataDetail[];accountStatus:"active"|"restricted"|"deletion-pending";}
const baseProfile:AccountProfile={displayName:"Jonathan",preferredLanguage:"English",timezone:"Europe/Berlin"};
const iso=(offsetMs:number)=>new Date(Date.now()-offsetMs).toISOString();

const commonPermissions:PermissionDefinition[]=[
  {id:"identity.basic",name:"Basic account identity",description:"Use your Account ID, display name and avatar.",required:true,mutableByUser:false,sensitivity:"basic"},
  {id:"app_data.read",name:"Read app cloud data",description:"Read this app's own cloud-data namespace.",required:true,mutableByUser:false,sensitivity:"basic"},
  {id:"app_data.write",name:"Update app cloud data",description:"Create and update this app's own cloud-data namespace.",required:true,mutableByUser:false,sensitivity:"basic"},
  {id:"backup.include",name:"Backup inclusion",description:"Allow this app's cloud data to be included in THIEPN backups.",required:false,mutableByUser:true,sensitivity:"sensitive"},
];
function caps(overrides:Partial<RegisteredApp["supportedCapabilities"]>={}):RegisteredApp["supportedCapabilities"]{return {accountIdentity:true,cloudSync:true,backup:true,export:true,cloudDataDeletion:true,permissionManagement:true,...overrides};}
const baseRegistry:RegisteredApp[]=[
  {id:"tms60",slug:"tms60",name:"TMS60",description:"Bible verse memorization and review.",status:"active",supportedCapabilities:caps(),availablePermissions:commonPermissions},
  {id:"diet",slug:"diet",name:"Diet Copilot",description:"Nutrition, weight and goal tracking.",status:"active",supportedCapabilities:caps(),availablePermissions:commonPermissions},
  {id:"steadybar",slug:"steadybar",name:"SteadyBar",description:"Practice planning and progress tracking.",status:"active",supportedCapabilities:caps({backup:false}),availablePermissions:commonPermissions.filter((p)=>p.id!=="backup.include")},
];

function scenarioFromUrl():Scenario{
  const value=new URLSearchParams(window.location.search).get("scenario");
  const allowed:Scenario[]=["default","new-account","many-apps","many-devices","security-warning","sync-problem","backup-failed","offline","partial-backend","deletion-pending","long-content","apps-empty","permission-request","connection-error","deprecated","unknown-registry","data-conflict","data-error","data-disabled","retained-data"];
  return allowed.includes(value as Scenario)?value as Scenario:"default";
}
function registryForScenario(scenario:Scenario):RegisteredApp[]{
  if(scenario==="many-apps")return Array.from({length:18},(_,i)=>({id:`app-${i+1}`,slug:`app-${i+1}`,name:`THIEPN App ${i+1}`,description:"A mock THIEPN ecosystem application.",status:i===10?"beta":"active",supportedCapabilities:caps(),availablePermissions:commonPermissions}));
  if(scenario==="deprecated")return baseRegistry.map((app)=>app.id==="steadybar"?{...app,status:"deprecated" as const}:app);
  return baseRegistry;
}
function initialConnections(scenario:Scenario):AppConnection[]{
  const registry=registryForScenario(scenario);
  if(scenario==="new-account"||scenario==="apps-empty")return [];
  const make=(app:RegisteredApp,index:number):AppConnection=>({
    appId:app.id,
    status:scenario==="permission-request"&&index===0?"limited":scenario==="connection-error"&&index===1?"error":"connected",
    connectedAt:iso((30-index)*86_400_000),
    lastUsedAt:iso(index*3_600_000),
    grantedPermissions:app.availablePermissions.map((permission):GrantedPermission=>({permissionId:permission.id,status:permission.required?"granted":scenario==="permission-request"&&index===0?"denied":"denied",updatedAt:iso(index*3_600_000)})),
  });
  const connections=registry.map(make);
  if(scenario==="unknown-registry")connections.push({appId:"legacy-unknown",status:"connected",connectedAt:iso(50*86_400_000),lastUsedAt:iso(5*86_400_000),grantedPermissions:[{permissionId:"legacy.access",status:"granted",updatedAt:iso(5*86_400_000)}]});
  return connections;
}
function baseDevices():DeviceRecord[]{return [{id:"dvc-current",label:"Chrome on Windows",platform:"Windows",current:true,firstSeenAt:iso(30*86_400_000),lastActivityAt:iso(0)},{id:"dvc-phone",label:"Samsung Internet on Android",platform:"Android",current:false,firstSeenAt:iso(14*86_400_000),lastActivityAt:iso(7_200_000)}];}
function baseSessions():SessionSummary[]{return [{id:"ses-current",deviceId:"dvc-current",createdAt:iso(2*86_400_000),lastActivityAt:iso(0),authMethod:"Google",clientName:"Chrome",current:true,status:"active"},{id:"ses-phone",deviceId:"dvc-phone",createdAt:iso(7*86_400_000),lastActivityAt:iso(7_200_000),authMethod:"Google",clientName:"Samsung Internet",current:false,status:"active"}];}
function baseEvents():SecurityEvent[]{return [{id:"evt-signin-current",type:"SIGN_IN_SUCCEEDED",category:"authentication",severity:"info",occurredAt:iso(2*86_400_000),title:"Signed in with Google",description:"A Google sign-in created the current Account session.",deviceId:"dvc-current",sessionId:"ses-current"},{id:"evt-signin-phone",type:"SIGN_IN_SUCCEEDED",category:"authentication",severity:"info",occurredAt:iso(7*86_400_000),title:"Signed in on Android",description:"A Google sign-in created a session on an Android client.",deviceId:"dvc-phone",sessionId:"ses-phone"},{id:"evt-profile",type:"PROFILE_UPDATED",category:"account",severity:"info",occurredAt:iso(10*86_400_000),title:"Profile updated",description:"Your THIEPN Account profile was updated."}];}
function initialState():MockState{
  const scenario=scenarioFromUrl();
  try{const persisted=JSON.parse(localStorage.getItem(STORAGE_KEY)??"") as MockState;if(persisted.version===6&&persisted.scenario===scenario)return persisted;}catch{}
  let devices=baseDevices(),sessions=baseSessions(),securityEvents=baseEvents();
  if(scenario==="new-account"){devices=devices.slice(0,1);sessions=sessions.slice(0,1);securityEvents=securityEvents.slice(0,1);}
  if(scenario==="many-devices"){const extra=Array.from({length:10},(_,index):DeviceRecord=>({id:`dvc-${index+1}`,label:`Browser on ${index%2?"Android":"Windows"} ${index+1}`,platform:index%2?"Android":"Windows",current:false,firstSeenAt:iso((index+20)*86_400_000),lastActivityAt:iso((index+1)*7_200_000)}));devices=[...devices,...extra];sessions=[...sessions,...extra.map((device,index):SessionSummary=>({id:`ses-${index+1}`,deviceId:device.id,createdAt:iso((index+5)*86_400_000),lastActivityAt:device.lastActivityAt,authMethod:"Google",clientName:index%2?"Chrome":"Edge",current:false,status:"active"}))];}
  if(scenario==="security-warning")securityEvents=[{id:"evt-warning",type:"NEW_SIGN_IN",category:"security",severity:"warning",occurredAt:iso(3_600_000),title:"New sign-in needs review",description:"A recent sign-in was marked for review.",deviceId:"dvc-phone",sessionId:"ses-phone"},...securityEvents];
  const appData:AppCloudDataDetail[]=initialConnections(scenario).map((connection,index)=>{const app=(registryForScenario(scenario).find((item)=>item.id===connection.appId));const name=app?.name??"Unknown THIEPN app";const baseStatus=scenario==="sync-problem"&&index===0?"delayed":scenario==="data-conflict"&&index===0?"conflict":scenario==="data-error"&&index===0?"error":scenario==="data-disabled"&&index===0?"disabled":"up-to-date";return {appId:connection.appId,appName:name,namespaceId:`ns_${connection.appId}_mock`,generation:1,revision:100+(index*13),schemaVersion:1,namespaceStatus:scenario==="retained-data"&&index===0?"retained":"active",storageBytes:520000+(index*880000),recordCount:120+(index*41),updatedAt:iso(index*7200000),configuration:{supported:true,enabled:baseStatus!=="disabled",userControllable:index<2},sync:{status:baseStatus,lastAttemptAt:iso(index*3600000),lastSuccessfulSyncAt:baseStatus==="error"?iso(86400000):iso(index*3600000),lastDataChangeAt:iso(index*7200000),pendingChanges:baseStatus==="delayed"?4:undefined,error:baseStatus==="conflict"?{code:"SYNC_CONFLICT",kind:"conflict",message:"This app needs to resolve a cloud-data conflict.",retryable:false}:baseStatus==="error"?{code:"SYNC_SERVER_ERROR",kind:"server",message:"The last synchronization attempt failed.",retryable:true}:undefined},clients:[{id:`sync-${index}-current`,label:"This device",lastSuccessfulSyncAt:iso(index*3600000),status:baseStatus==="conflict"?"reconciliation-required":"up-to-date"}]};});if(scenario==="retained-data"&&appData[0]){appData[0]={...appData[0],namespaceStatus:"retained",sync:{...appData[0].sync,status:"unavailable"},configuration:{...appData[0].configuration,enabled:false}};}return {version:6,scenario,auth:"signed-in",profile:scenario==="long-content"?{...baseProfile,displayName:"Jonathan Maximilian Very-Long-Multilingual-Account-Name 테스트"}:baseProfile,devices,sessions,securityEvents,connections:initialConnections(scenario),appData,accountStatus:scenario==="deletion-pending"?"deletion-pending":"active"};
}
const delay=(ms=220)=>new Promise<void>((resolve)=>window.setTimeout(resolve,ms));
function accountError(code:string,message:string,kind:AccountError["kind"]="network",retryable=true):AccountError{return {code,kind,message,retryable};}

export function createMockAccountService():AccountService{
  let state=initialState();
  const persist=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); const scenario=()=>state.scenario;
  const registry=()=>registryForScenario(scenario()); const activeSessions=()=>state.sessions.filter((s)=>s.status==="active");
  const devices=():DeviceSummary[]=>state.devices.map((d)=>({...d,sessions:activeSessions().filter((s)=>s.deviceId===d.id)})).filter((d)=>d.current||d.sessions.length>0);
  const appOrFallback=(appId:string):RegisteredApp=>registry().find((app)=>app.id===appId)??{id:appId,slug:appId,name:"Unknown THIEPN app",description:"This connection refers to an app that is no longer present in the current registry.",status:"disabled",supportedCapabilities:caps({backup:false,cloudSync:false,export:false,cloudDataDeletion:false}),availablePermissions:[]};
  const connectedSummaries=():ConnectedAppSummary[]=>state.connections.filter((c)=>c.status!=="disconnected"&&c.status!=="suspended").map((c)=>{const app=appOrFallback(c.appId);return {id:app.id,name:app.name,status:c.status==="limited"?"limited":c.status==="error"?"error":"connected",lastUsedAt:c.lastUsedAt,permissionCount:c.grantedPermissions.filter((p)=>p.status==="granted").length};});
  const security=():SecuritySummary=>({attention:scenario()==="security-warning"?["A new sign-in needs your review."]:scenario()==="permission-request"?["TMS60 is requesting additional account access."]:[],authMethod:"Google",twoStepVerification:"unavailable",recentActivity:state.securityEvents.slice(0,5)});
  const data=():DataSummary=>{const attention=state.appData.filter((item)=>["delayed","conflict","error"].includes(item.sync.status)).length;return {totalStorageBytes:state.appData.reduce((sum,item)=>sum+item.storageBytes,0),appCount:state.appData.length,syncStatus:attention?"attention":"healthy",attentionCount:attention,lastBackupAt:scenario()==="new-account"?undefined:iso(43_200_000),backupStatus:scenario()==="new-account"?"none":scenario()==="backup-failed"?"failed":"verified"};};
  const capabilities:AccountCapabilities={profileRead:true,profileWrite:scenario()!=="partial-backend",securityRead:true,securityActivityRead:true,devicesRead:true,sessionRevocation:"individual",deviceIdentity:"stable",appsRead:true,dataRead:scenario()!=="partial-backend",privacyRead:true};
  const mutationGuard=()=>{if(scenario()==="offline")throw accountError("OFFLINE","This action is unavailable while offline.");};
  const addEvent=(event:Omit<SecurityEvent,"id"|"occurredAt">)=>{state={...state,securityEvents:[{...event,id:`evt-${Date.now()}`,occurredAt:new Date().toISOString()},...state.securityEvents]};};
  const getDetail=(appId:string):ConnectedAppDetail|null=>{const connection=state.connections.find((c)=>c.appId===appId);if(!connection)return null;return {app:appOrFallback(appId),connection};};
  const updatePermission=(appId:string,permissionId:string,status:GrantedPermission["status"])=>{
    const detail=getDetail(appId);if(!detail)throw accountError("CONNECTION_NOT_FOUND","This app is not connected.","conflict",false);
    if(detail.connection.status==="disconnected")throw accountError("CONNECTION_NOT_FOUND","This app is disconnected.","conflict",false);
    const definition=detail.app.availablePermissions.find((p)=>p.id===permissionId);
    if(!definition)throw accountError("PERMISSION_NOT_FOUND","This permission is unavailable.","validation",false);
    if(status==="denied"&&(definition.required||!definition.mutableByUser))throw accountError("PERMISSION_REQUIRED","Required permissions cannot be removed independently.","conflict",false);
    state={...state,connections:state.connections.map((connection)=>connection.appId===appId?{...connection,grantedPermissions:connection.grantedPermissions.map((grant)=>grant.permissionId===permissionId?{...grant,status,updatedAt:new Date().toISOString()}:grant),status:connection.status==="limited"&&status==="granted"?"connected":connection.status}:connection)};
    addEvent({type:status==="granted"?"APP_PERMISSION_GRANTED":"APP_PERMISSION_REVOKED",category:"apps",severity:"info",title:`${definition.name} ${status==="granted"?"allowed":"revoked"}`,description:`${detail.app.name} account access changed.`});persist();
  };

  const backupService=createMockBackupService({
    scenario:scenario(),
    getAppData:()=>state.appData,
    setAppData:(items)=>{state={...state,appData:items};persist();},
    addSecurityEvent:(title,description,type)=>{addEvent({type,category:"account",severity:"info",title,description});persist();},
  });

  const privacyService=createMockPrivacyService({
    scenario:scenario(),
    getProfile:()=>state.profile,
    getApps:()=>connectedSummaries(),
    getAppData:()=>state.appData,
    setAppData:(items)=>{state={...state,appData:items};persist();},
    getBackupCount:async()=>(await backupService.listBackups()).length,
    getAccountStatus:()=>state.accountStatus,
    setAccountStatus:(accountStatus)=>{state={...state,accountStatus};persist();},
    addSecurityEvent:(title,description,type)=>{addEvent({type,category:"account",severity:"info",title,description});persist();},
  });

  return {
    auth:{async getState(){await delay(120);return state.auth;},async signIn(returnTo){await delay(300);state={...state,auth:"signed-in"};persist();if(returnTo)sessionStorage.setItem("thiepn.account.returnTo",returnTo);return {redirecting:false};},async completeCallback(){return sessionStorage.getItem("thiepn.account.returnTo")??"/";},async isRecentlyAuthenticated(){return true;},async reauthenticate(){return {redirecting:false};},async signOut(){await delay(220);state={...state,auth:"signed-out"};persist();},subscribe(){return ()=>{};}},
    profile:{async getProfile(){await delay();return {...state.profile};},async updateProfile(input){mutationGuard();await delay(420);state={...state,profile:{...state.profile,displayName:input.displayName.trim(),preferredLanguage:input.preferredLanguage,timezone:input.timezone}};addEvent({type:"PROFILE_UPDATED",category:"account",severity:"info",title:"Profile updated",description:"Your THIEPN Account profile was updated."});persist();return {...state.profile};}},
    security:{async getSummary(){await delay();return security();},async listActivity(){await delay();return [...state.securityEvents];},async getEvent(id){await delay();return state.securityEvents.find((event)=>event.id===id)??null;}},
    devices:{
      async listDevices(){await delay();return devices();},async getDevice(id){await delay();return devices().find((device)=>device.id===id)??null;},async listSessions(){await delay();return activeSessions();},
      async revokeSession(id){mutationGuard();await delay(520);const target=state.sessions.find((s)=>s.id===id);if(!target||target.status!=="active")return;if(target.current)throw accountError("CURRENT_SESSION","Use Sign out for the current session.","conflict",false);state={...state,sessions:state.sessions.map((s)=>s.id===id?{...s,status:"revoked" as const}:s)};addEvent({type:"SESSION_REVOKED",category:"security",severity:"info",title:"Session signed out",description:`${target.clientName} was signed out.`,deviceId:target.deviceId,sessionId:target.id});persist();},
      async revokeDevice(id){mutationGuard();await delay(620);const target=state.devices.find((d)=>d.id===id);if(!target)return;if(target.current)throw accountError("CURRENT_DEVICE","Use Sign out for the current device.","conflict",false);const ids=new Set(state.sessions.filter((s)=>s.deviceId===id&&s.status==="active").map((s)=>s.id));state={...state,sessions:state.sessions.map((s)=>ids.has(s.id)?{...s,status:"revoked" as const}:s)};addEvent({type:"DEVICE_SESSIONS_REVOKED",category:"security",severity:"info",title:"Device signed out",description:`${target.label} no longer has active Account sessions.`,deviceId:id});persist();},
      async revokeOtherSessions(){mutationGuard();await delay(720);const remote=activeSessions().filter((s)=>!s.current);if(!remote.length)return;const ids=new Set(remote.map((s)=>s.id));state={...state,sessions:state.sessions.map((s)=>ids.has(s.id)?{...s,status:"revoked" as const}:s)};addEvent({type:"OTHER_SESSIONS_REVOKED",category:"security",severity:"info",title:"Other sessions signed out",description:`${remote.length} other active Account session${remote.length===1?" was":"s were"} signed out.`});persist();},
    },
    apps:{
      async listApps(){await delay();return connectedSummaries();},
      async getApp(appId){await delay();return getDetail(appId);},
      async grantPermission(appId,permissionId){mutationGuard();await delay(480);updatePermission(appId,permissionId,"granted");return getDetail(appId)!;},
      async revokePermission(appId,permissionId){mutationGuard();await delay(480);updatePermission(appId,permissionId,"denied");return getDetail(appId)!;},
      async disconnect(appId){mutationGuard();await delay(620);const detail=getDetail(appId);if(!detail||detail.connection.status==="disconnected")return;state={...state,connections:state.connections.map((c)=>c.appId===appId?{...c,status:"disconnected" as const,grantedPermissions:c.grantedPermissions.map((g)=>({...g,status:"denied" as const,updatedAt:new Date().toISOString()}))}:c),appData:state.appData.map((item)=>item.appId===appId?{...item,namespaceStatus:"retained" as const,configuration:{...item.configuration,enabled:false},sync:{...item.sync,status:"unavailable" as const,error:undefined}}:item)};addEvent({type:"APP_DISCONNECTED",category:"apps",severity:"info",title:`${detail.app.name} disconnected`,description:"The app no longer has THIEPN Account access. Existing cloud data is retained."});persist();},
    },
    data:{
      async getSummary(){await delay();return data();},
      async listAppData(){await delay();return [...state.appData].sort((a,b)=>{const rank=(value:string)=>value==="conflict"?0:value==="error"?1:value==="delayed"?2:value==="pending"||value==="syncing"?3:value==="up-to-date"?4:5;return rank(a.sync.status)-rank(b.sync.status);});},
      async getAppData(appId){await delay();return state.appData.find((item)=>item.appId===appId)??null;},
      async retrySync(appId){mutationGuard();const item=state.appData.find((entry)=>entry.appId===appId);if(!item)throw accountError("DATA_NOT_FOUND","No cloud data exists for this app.","conflict",false);if(!item.sync.error?.retryable&&item.sync.status==="conflict")throw accountError("CONFLICT_REQUIRES_APP","This conflict must be resolved inside the app.","conflict",false);state={...state,appData:state.appData.map((entry)=>entry.appId===appId?{...entry,sync:{...entry.sync,status:"syncing" as const,lastAttemptAt:new Date().toISOString(),error:undefined}}:entry)};persist();await delay(650);const now=new Date().toISOString();state={...state,appData:state.appData.map((entry)=>entry.appId===appId?{...entry,sync:{...entry.sync,status:"up-to-date" as const,lastSuccessfulSyncAt:now,lastAttemptAt:now,pendingChanges:0,error:undefined}}:entry)};persist();return state.appData.find((entry)=>entry.appId===appId)!;},
      async updateSyncConfiguration(appId,enabled){mutationGuard();await delay(480);const item=state.appData.find((entry)=>entry.appId===appId);if(!item)throw accountError("DATA_NOT_FOUND","No cloud data exists for this app.","conflict",false);if(!item.configuration.userControllable)throw accountError("SYNC_NOT_USER_CONTROLLABLE","This app manages cloud synchronization automatically.","unsupported",false);state={...state,appData:state.appData.map((entry)=>entry.appId===appId?{...entry,configuration:{...entry.configuration,enabled},sync:{...entry.sync,status:enabled?"pending" as const:"disabled" as const,pendingChanges:enabled?entry.sync.pendingChanges??0:undefined,error:undefined}}:entry)};addEvent({type:enabled?"APP_SYNC_ENABLED":"APP_SYNC_DISABLED",category:"apps",severity:"info",title:`Cloud sync ${enabled?"enabled":"disabled"}`,description:`${item.appName} cloud sync was ${enabled?"enabled":"disabled"}. Existing cloud data remains stored.`});persist();return state.appData.find((entry)=>entry.appId===appId)!;},
    },
    backup:backupService,
    privacy:privacyService,
    capabilities:{async getCapabilities(){await delay(120);return capabilities;}},
    async getOverview(){await delay(260);return {identity:{accountId:"acct_mock_0001",displayName:state.profile.displayName,primaryEmail:"jonathan@example.com",emailVerified:true,provider:"google",createdAt:"2026-06-27T08:36:21.000Z",status:state.accountStatus},security:security(),devices:devices(),apps:connectedSummaries(),data:data(),capabilities};},
  };
}
