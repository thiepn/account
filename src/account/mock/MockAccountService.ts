import type { AccountCapabilities, AccountError, AccountProfile, AuthState, ConnectedAppSummary, DataSummary, DeviceSummary, SecurityEvent, SecuritySummary, SessionSummary } from "../types";
import type { AccountService } from "../service";

const STORAGE_KEY="thiepn.account.mock.v2";
type Scenario="default"|"new-account"|"many-apps"|"many-devices"|"security-warning"|"sync-problem"|"backup-failed"|"offline"|"partial-backend"|"deletion-pending"|"long-content";
interface DeviceRecord {id:string;label:string;platform:string;current:boolean;firstSeenAt:string;lastActivityAt:string;}
interface MockState {version:2;scenario:Scenario;auth:AuthState;profile:AccountProfile;devices:DeviceRecord[];sessions:SessionSummary[];securityEvents:SecurityEvent[];}
const baseProfile:AccountProfile={displayName:"Jonathan",preferredLanguage:"English",timezone:"Europe/Berlin"};
const iso=(offsetMs:number)=>new Date(Date.now()-offsetMs).toISOString();

function scenarioFromUrl():Scenario{
  const value=new URLSearchParams(window.location.search).get("scenario");
  const allowed:Scenario[]=["default","new-account","many-apps","many-devices","security-warning","sync-problem","backup-failed","offline","partial-backend","deletion-pending","long-content"];
  return allowed.includes(value as Scenario)?value as Scenario:"default";
}
function baseDevices():DeviceRecord[]{
  return [
    {id:"dvc-current",label:"Chrome on Windows",platform:"Windows",current:true,firstSeenAt:iso(30*86_400_000),lastActivityAt:iso(0)},
    {id:"dvc-phone",label:"Samsung Internet on Android",platform:"Android",current:false,firstSeenAt:iso(14*86_400_000),lastActivityAt:iso(7_200_000)},
  ];
}
function baseSessions():SessionSummary[]{
  return [
    {id:"ses-current",deviceId:"dvc-current",createdAt:iso(2*86_400_000),lastActivityAt:iso(0),authMethod:"Google",clientName:"Chrome",current:true,status:"active"},
    {id:"ses-phone",deviceId:"dvc-phone",createdAt:iso(7*86_400_000),lastActivityAt:iso(7_200_000),authMethod:"Google",clientName:"Samsung Internet",current:false,status:"active"},
  ];
}
function baseEvents():SecurityEvent[]{
  return [
    {id:"evt-signin-current",type:"SIGN_IN_SUCCEEDED",category:"authentication",severity:"info",occurredAt:iso(2*86_400_000),title:"Signed in with Google",description:"A Google sign-in created the current Account session.",deviceId:"dvc-current",sessionId:"ses-current"},
    {id:"evt-signin-phone",type:"SIGN_IN_SUCCEEDED",category:"authentication",severity:"info",occurredAt:iso(7*86_400_000),title:"Signed in on Android",description:"A Google sign-in created a session on an Android client.",deviceId:"dvc-phone",sessionId:"ses-phone"},
    {id:"evt-profile",type:"PROFILE_UPDATED",category:"account",severity:"info",occurredAt:iso(10*86_400_000),title:"Profile updated",description:"Your THIEPN Account profile was updated."},
  ];
}
function initialState():MockState{
  const scenario=scenarioFromUrl();
  try{
    const persisted=JSON.parse(localStorage.getItem(STORAGE_KEY)??"") as MockState;
    if(persisted.version===2&&persisted.scenario===scenario)return persisted;
  }catch{}
  let devices=baseDevices(),sessions=baseSessions(),securityEvents=baseEvents();
  if(scenario==="new-account"){devices=devices.slice(0,1);sessions=sessions.slice(0,1);securityEvents=securityEvents.slice(0,1);}
  if(scenario==="many-devices"){
    const extra=Array.from({length:10},(_,index):DeviceRecord=>({id:`dvc-${index+1}`,label:`Browser on ${index%2?"Android":"Windows"} ${index+1}`,platform:index%2?"Android":"Windows",current:false,firstSeenAt:iso((index+20)*86_400_000),lastActivityAt:iso((index+1)*7_200_000)}));
    devices=[...devices,...extra];
    sessions=[...sessions,...extra.map((device,index):SessionSummary=>({id:`ses-${index+1}`,deviceId:device.id,createdAt:iso((index+5)*86_400_000),lastActivityAt:device.lastActivityAt,authMethod:"Google",clientName:index%2?"Chrome":"Edge",current:false,status:"active"}))];
  }
  if(scenario==="security-warning")securityEvents=[{id:"evt-warning",type:"NEW_SIGN_IN",category:"security",severity:"warning",occurredAt:iso(3_600_000),title:"New sign-in needs review",description:"A recent sign-in was marked for review.",deviceId:"dvc-phone",sessionId:"ses-phone"},...securityEvents];
  return {version:2,scenario,auth:"signed-in",profile:scenario==="long-content"?{...baseProfile,displayName:"Jonathan Maximilian Very-Long-Multilingual-Account-Name 테스트"}:baseProfile,devices,sessions,securityEvents};
}
const delay=(ms=220)=>new Promise<void>((resolve)=>window.setTimeout(resolve,ms));
function accountError(code:string,message:string):AccountError{return {code,kind:"network",message,retryable:true};}

function makeApps(scenario:Scenario):ConnectedAppSummary[]{
  const baseline:ConnectedAppSummary[]=[
    {id:"tms60",name:"TMS60",status:"connected",lastUsedAt:iso(0)},
    {id:"diet",name:"Diet Copilot",status:"connected",lastUsedAt:iso(3_600_000)},
    {id:"steadybar",name:"SteadyBar",status:"connected",lastUsedAt:iso(86_400_000)},
  ];
  if(scenario==="new-account")return [];
  if(scenario!=="many-apps")return baseline;
  return Array.from({length:18},(_,index)=>({id:`app-${index+1}`,name:`THIEPN App ${index+1}`,status:index===5?"limited":"connected",lastUsedAt:iso(index*3_600_000)}));
}

export function createMockAccountService():AccountService{
  let state=initialState();
  const persist=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  const scenario=()=>state.scenario;
  const activeSessions=()=>state.sessions.filter((session)=>session.status==="active");
  const devices=():DeviceSummary[]=>state.devices.map((device)=>({...device,sessions:activeSessions().filter((session)=>session.deviceId===device.id)})).filter((device)=>device.current||device.sessions.length>0);
  const security=():SecuritySummary=>({attention:scenario()==="security-warning"?["A new sign-in needs your review."]:[],authMethod:"Google",twoStepVerification:"unavailable",recentActivity:state.securityEvents.slice(0,5)});
  const data=():DataSummary=>({totalStorageBytes:3_482_112,appCount:makeApps(scenario()).length,syncStatus:scenario()==="sync-problem"?"attention":"healthy",lastBackupAt:scenario()==="new-account"?undefined:iso(43_200_000),backupStatus:scenario()==="new-account"?"none":scenario()==="backup-failed"?"failed":"verified"});
  const capabilities:AccountCapabilities={profileRead:true,profileWrite:scenario()!=="partial-backend",securityRead:true,devicesRead:true,appsRead:true,dataRead:scenario()!=="partial-backend",privacyRead:true};
  const mutationGuard=()=>{if(scenario()==="offline")throw accountError("OFFLINE","This action is unavailable while offline.");};
  const addEvent=(event:Omit<SecurityEvent,"id"|"occurredAt">)=>{state={...state,securityEvents:[{...event,id:`evt-${Date.now()}`,occurredAt:new Date().toISOString()},...state.securityEvents]};};

  return {
    auth:{
      async getState(){await delay(120);return state.auth;},
      async signIn(){await delay(300);state={...state,auth:"signed-in"};persist();},
      async signOut(){await delay(220);state={...state,auth:"signed-out"};persist();},
    },
    profile:{
      async getProfile(){await delay();return {...state.profile};},
      async updateProfile(input){mutationGuard();await delay(420);state={...state,profile:{...state.profile,displayName:input.displayName.trim(),preferredLanguage:input.preferredLanguage,timezone:input.timezone}};addEvent({type:"PROFILE_UPDATED",category:"account",severity:"info",title:"Profile updated",description:"Your THIEPN Account profile was updated."});persist();return {...state.profile};},
    },
    security:{
      async getSummary(){await delay();return security();},
      async listActivity(){await delay();return [...state.securityEvents];},
      async getEvent(id){await delay();return state.securityEvents.find((event)=>event.id===id)??null;},
    },
    devices:{
      async listDevices(){await delay();return devices();},
      async getDevice(id){await delay();return devices().find((device)=>device.id===id)??null;},
      async listSessions(){await delay();return activeSessions();},
      async revokeSession(id){
        mutationGuard();await delay(520);
        const target=state.sessions.find((session)=>session.id===id);
        if(!target||target.status!=="active")return;
        if(target.current)throw {code:"CURRENT_SESSION",kind:"conflict",message:"Use Sign out for the current session.",retryable:false} satisfies AccountError;
        state={...state,sessions:state.sessions.map((session)=>session.id===id?{...session,status:"revoked" as const}:session)};
        addEvent({type:"SESSION_REVOKED",category:"security",severity:"info",title:"Session signed out",description:`${target.clientName} was signed out.`,deviceId:target.deviceId,sessionId:target.id});persist();
      },
      async revokeDevice(id){
        mutationGuard();await delay(620);
        const target=state.devices.find((device)=>device.id===id);
        if(!target)return;
        if(target.current)throw {code:"CURRENT_DEVICE",kind:"conflict",message:"Use Sign out for the current device.",retryable:false} satisfies AccountError;
        const targetIds=new Set(state.sessions.filter((session)=>session.deviceId===id&&session.status==="active").map((session)=>session.id));
        state={...state,sessions:state.sessions.map((session)=>targetIds.has(session.id)?{...session,status:"revoked" as const}:session)};
        addEvent({type:"DEVICE_SESSIONS_REVOKED",category:"security",severity:"info",title:"Device signed out",description:`${target.label} no longer has active Account sessions.`,deviceId:id});persist();
      },
      async revokeOtherSessions(){
        mutationGuard();await delay(720);
        const remote=activeSessions().filter((session)=>!session.current);
        if(!remote.length)return;
        const ids=new Set(remote.map((session)=>session.id));
        state={...state,sessions:state.sessions.map((session)=>ids.has(session.id)?{...session,status:"revoked" as const}:session)};
        addEvent({type:"OTHER_SESSIONS_REVOKED",category:"security",severity:"info",title:"Other sessions signed out",description:`${remote.length} other active Account session${remote.length===1?" was":"s were"} signed out.`});persist();
      },
    },
    apps:{async listApps(){await delay();return makeApps(scenario());}},
    data:{async getSummary(){await delay();return data();}},
    privacy:{async getSummary(){await delay();return {exportAvailable:true,appDeletionAvailable:false,accountDeletionAvailable:false};}},
    capabilities:{async getCapabilities(){await delay(120);return capabilities;}},
    async getOverview(){await delay(260);return {identity:{accountId:"acct_mock_0001",displayName:state.profile.displayName,primaryEmail:"jonathan@example.com",emailVerified:true,provider:"google",createdAt:"2026-06-27T08:36:21.000Z",status:scenario()==="deletion-pending"?"deletion-pending":"active"},security:security(),devices:devices(),apps:makeApps(scenario()),data:data()};},
  };
}
