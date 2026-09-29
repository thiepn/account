import type { AccountCapabilities, AccountProfile, AuthState, ConnectedAppSummary, DataSummary, DeviceSummary, Overview, SecuritySummary } from "../types";
import type { AccountService } from "../service";

const STORAGE_KEY="thiepn.account.mock.v1";
type Scenario="default"|"new-account"|"many-apps"|"many-devices"|"security-warning"|"sync-problem"|"backup-failed"|"offline"|"partial-backend"|"deletion-pending"|"long-content";
interface MockState {version:1;scenario:Scenario;auth:AuthState;profile:AccountProfile;}
const baseProfile:AccountProfile={displayName:"Jonathan",preferredLanguage:"English",timezone:"Europe/Berlin"};

function scenarioFromUrl():Scenario{
  const value=new URLSearchParams(window.location.search).get("scenario");
  const allowed:Scenario[]=["default","new-account","many-apps","many-devices","security-warning","sync-problem","backup-failed","offline","partial-backend","deletion-pending","long-content"];
  return allowed.includes(value as Scenario)?value as Scenario:"default";
}
function initialState():MockState{
  const scenario=scenarioFromUrl();
  try{
    const persisted=JSON.parse(localStorage.getItem(STORAGE_KEY)??"") as MockState;
    if(persisted.version===1&&persisted.scenario===scenario)return persisted;
  }catch{}
  return {version:1,scenario,auth:"signed-in",profile:scenario==="long-content"?{...baseProfile,displayName:"Jonathan Maximilian Very-Long-Multilingual-Account-Name 테스트"}:baseProfile};
}
const delay=(ms=220)=>new Promise<void>((resolve)=>window.setTimeout(resolve,ms));

function makeApps(scenario:Scenario):ConnectedAppSummary[]{
  const baseline:ConnectedAppSummary[]=[
    {id:"tms60",name:"TMS60",status:"connected",lastUsedAt:new Date().toISOString()},
    {id:"diet",name:"Diet Copilot",status:"connected",lastUsedAt:new Date(Date.now()-3_600_000).toISOString()},
    {id:"steadybar",name:"SteadyBar",status:"connected",lastUsedAt:new Date(Date.now()-86_400_000).toISOString()},
  ];
  if(scenario==="new-account")return [];
  if(scenario!=="many-apps")return baseline;
  return Array.from({length:18},(_,index)=>({id:`app-${index+1}`,name:`THIEPN App ${index+1}`,status:index===5?"limited":"connected",lastUsedAt:new Date(Date.now()-index*3_600_000).toISOString()}));
}
function makeDevices(scenario:Scenario):DeviceSummary[]{
  const current:DeviceSummary={id:"dvc-current",label:"Chrome on Windows",platform:"Windows",current:true,lastActivityAt:new Date().toISOString(),sessions:1};
  if(scenario==="new-account")return [current];
  const others:DeviceSummary[]=[{id:"dvc-phone",label:"Samsung Internet on Android",platform:"Android",current:false,lastActivityAt:new Date(Date.now()-7_200_000).toISOString(),sessions:1}];
  if(scenario!=="many-devices")return [current,...others];
  return [current,...Array.from({length:11},(_,index)=>({id:`dvc-${index+1}`,label:`Browser session ${index+1}`,platform:index%2?"Android":"Windows",current:false,lastActivityAt:new Date(Date.now()-(index+1)*7_200_000).toISOString(),sessions:index%3===0?2:1}))];
}

export function createMockAccountService():AccountService{
  let state=initialState();
  const persist=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  const scenario=()=>state.scenario;
  const security=():SecuritySummary=>({attention:scenario()==="security-warning"?["A new sign-in needs your review."]:[],authMethod:"Google",twoStepVerification:"unavailable",recentActivity:["Signed in with Google","Profile information viewed"]});
  const data=():DataSummary=>({totalStorageBytes:3_482_112,appCount:makeApps(scenario()).length,syncStatus:scenario()==="sync-problem"?"attention":"healthy",lastBackupAt:scenario()==="new-account"?undefined:new Date(Date.now()-43_200_000).toISOString(),backupStatus:scenario()==="new-account"?"none":scenario()==="backup-failed"?"failed":"verified"});
  const capabilities:AccountCapabilities={profileRead:true,profileWrite:scenario()!=="partial-backend",securityRead:true,devicesRead:true,appsRead:true,dataRead:scenario()!=="partial-backend",privacyRead:true};
  return {
    auth:{
      async getState(){await delay(120);return state.auth;},
      async signIn(){await delay(300);state={...state,auth:"signed-in"};persist();},
      async signOut(){await delay(220);state={...state,auth:"signed-out"};persist();},
    },
    profile:{
      async getProfile(){await delay();return {...state.profile};},
      async updateProfile(input){await delay(420);state={...state,profile:{...state.profile,displayName:input.displayName.trim()}};persist();return {...state.profile};},
    },
    security:{async getSummary(){await delay();return security();}},
    devices:{async listDevices(){await delay();return makeDevices(scenario());}},
    apps:{async listApps(){await delay();return makeApps(scenario());}},
    data:{async getSummary(){await delay();return data();}},
    privacy:{async getSummary(){await delay();return {exportAvailable:true,appDeletionAvailable:false,accountDeletionAvailable:false};}},
    capabilities:{async getCapabilities(){await delay(120);return capabilities;}},
    async getOverview():Promise<Overview>{
      await delay(260);
      return {
        identity:{accountId:"acct_mock_0001",displayName:state.profile.displayName,primaryEmail:"jonathan@example.com",emailVerified:true,provider:"google",createdAt:"2026-06-27T08:36:21.000Z",status:scenario()==="deletion-pending"?"deletion-pending":"active"},
        security:security(),devices:makeDevices(scenario()),apps:makeApps(scenario()),data:data(),
      };
    },
  };
}
