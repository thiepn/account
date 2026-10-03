import type { AccountService } from "../service";
import type { AccountError } from "../types";

const error:AccountError={code:"BACKEND_NOT_CONFIGURED",kind:"unsupported",message:"The real THIEPN Account backend adapter is not configured in this build.",retryable:false};
const fail=async()=>{throw error;};
const domain=new Proxy({}, {get:()=>fail});

export const unavailableAccountService:AccountService={
  hubOAuth:domain as AccountService['hubOAuth'],
  hub:domain as AccountService['hub'],
  auth:{async getState(){return "signed-out";},signIn:fail,completeCallback:fail,isRecentlyAuthenticated:fail,reauthenticate:fail,async signOut(){},subscribe(){return ()=>{};}},
  profile:domain as AccountService["profile"],
  security:domain as AccountService["security"],
  devices:domain as AccountService["devices"],
  apps:domain as AccountService["apps"],
  data:domain as AccountService["data"],
  backup:domain as AccountService["backup"],
  privacy:domain as AccountService["privacy"],
  capabilities:domain as AccountService["capabilities"],
  getOverview:fail,
};
