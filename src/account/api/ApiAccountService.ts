import { z } from "zod";
import type { AccountService } from "../service";
import type { AccountCapabilities, AccountError, AccountIdentity, AccountProfile, Overview } from "../types";
import { getAccountSupabaseClient } from "./supabase";
import { consumeReturnTo, saveReturnTo } from "./returnTo";

const profileRowSchema=z.object({
  user_id:z.string().uuid(),
  display_name:z.string().nullable(),
  preferred_language:z.string().nullable(),
  timezone:z.string().nullable(),
  created_at:z.string(),
  updated_at:z.string(),
});
type ProfileRow=z.infer<typeof profileRowSchema>;

const capabilities:AccountCapabilities={
  profileRead:true,profileWrite:true,
  securityRead:false,devicesRead:false,appsRead:false,dataRead:false,privacyRead:false,
};

function normalizedError(code:string,kind:AccountError["kind"],retryable:boolean):AccountError{return {code,kind,retryable};}
function mapError(error:unknown,fallback="ACCOUNT_API_ERROR"):AccountError{
  if(error&&typeof error==="object"){
    const candidate=error as {status?:number;code?:string};
    if(candidate.status===401)return normalizedError(candidate.code??"AUTH_REQUIRED","authentication",false);
    if(candidate.status===403)return normalizedError(candidate.code??"FORBIDDEN","authorization",false);
    if(candidate.status===409)return normalizedError(candidate.code??"VERSION_CONFLICT","conflict",false);
    if(candidate.status===429)return normalizedError(candidate.code??"RATE_LIMITED","rate_limit",true);
    if(candidate.status&&candidate.status>=500)return normalizedError(candidate.code??fallback,"server",true);
  }
  return normalizedError(fallback,"server",true);
}
function profileFromRow(row:ProfileRow,userName?:string|null):AccountProfile{
  const browserLanguage=typeof navigator!=="undefined"?navigator.language.split("-")[0]||"en":"en";
  const browserTimezone=typeof Intl!=="undefined"?Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC":"UTC";
  return {
    displayName:row.display_name?.trim()||userName?.trim()||"THIEPN user",
    preferredLanguage:row.preferred_language||browserLanguage,
    timezone:row.timezone||browserTimezone,
  };
}
function unsupported<T>():Promise<T>{return Promise.reject(normalizedError("CAPABILITY_UNAVAILABLE","unsupported",false));}

export function createApiAccountService():AccountService{
  const supabase=getAccountSupabaseClient();

  async function getUser(){
    const {data,error}=await supabase.auth.getUser();
    if(error)throw mapError(error,"AUTH_USER_FAILED");
    if(!data.user)throw normalizedError("AUTH_REQUIRED","authentication",false);
    return data.user;
  }
  async function getProfileRow(){
    const user=await getUser();
    const {data,error}=await supabase.from("account_profiles").select("user_id,display_name,preferred_language,timezone,created_at,updated_at").eq("user_id",user.id).maybeSingle();
    if(error)throw mapError(error,"PROFILE_READ_FAILED");
    if(!data)throw normalizedError("PROFILE_NOT_FOUND","conflict",false);
    const parsed=profileRowSchema.safeParse(data);
    if(!parsed.success)throw normalizedError("PROFILE_SCHEMA_INVALID","server",false);
    return {user,row:parsed.data};
  }
  async function getIdentityAndProfile(){
    const {user,row}=await getProfileRow();
    const metadataName=typeof user.user_metadata?.full_name==="string"?user.user_metadata.full_name:typeof user.user_metadata?.name==="string"?user.user_metadata.name:null;
    const profile=profileFromRow(row,metadataName);
    const identity:AccountIdentity={
      accountId:user.id,
      displayName:profile.displayName,
      primaryEmail:user.email??"Email unavailable",
      emailVerified:Boolean(user.email_confirmed_at),
      provider:"google",
      createdAt:user.created_at,
      status:"active",
    };
    return {identity,profile};
  }

  const service:AccountService={
    auth:{
      async getState(){
        const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
        if(sessionError)throw mapError(sessionError,"AUTH_SESSION_READ_FAILED");
        if(!sessionData.session)return "signed-out";
        const {data,error}=await supabase.auth.getUser();
        if(error)throw mapError(error,"AUTH_SESSION_VERIFY_FAILED");
        return data.user?"signed-in":"session-expired";
      },
      async signIn(returnTo){
        saveReturnTo(returnTo??"/");
        const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${window.location.origin}/auth/callback`}});
        if(error)throw mapError(error,"OAUTH_START_FAILED");
        return {redirecting:true};
      },
      async completeCallback(){
        const code=new URLSearchParams(window.location.search).get("code");
        if(!code)throw normalizedError("OAUTH_CODE_MISSING","authentication",false);
        const {error}=await supabase.auth.exchangeCodeForSession(code);
        if(error)throw mapError(error,"OAUTH_CALLBACK_FAILED");
        await getUser();
        return consumeReturnTo();
      },
      async signOut(){
        const {error}=await supabase.auth.signOut({scope:"local"});
        if(error)throw mapError(error,"SIGN_OUT_FAILED");
      },
      subscribe(listener){
        const {data}=supabase.auth.onAuthStateChange((_event,session)=>listener(session?"signed-in":"signed-out"));
        return ()=>data.subscription.unsubscribe();
      },
    },
    profile:{
      async getProfile(){return (await getIdentityAndProfile()).profile;},
      async updateProfile(input){
        const user=await getUser();
        const {data,error}=await supabase.from("account_profiles").update({display_name:input.displayName.trim(),preferred_language:input.preferredLanguage,timezone:input.timezone}).eq("user_id",user.id).select("user_id,display_name,preferred_language,timezone,created_at,updated_at").single();
        if(error)throw mapError(error,"PROFILE_WRITE_FAILED");
        const parsed=profileRowSchema.safeParse(data);
        if(!parsed.success)throw normalizedError("PROFILE_SCHEMA_INVALID","server",false);
        return profileFromRow(parsed.data,null);
      },
    },
    security:{getSummary:()=>unsupported(),listActivity:()=>unsupported(),getEvent:()=>unsupported()},
    devices:{listDevices:()=>unsupported(),getDevice:()=>unsupported(),listSessions:()=>unsupported(),revokeSession:()=>unsupported(),revokeDevice:()=>unsupported(),revokeOtherSessions:()=>unsupported()},
    apps:{listApps:()=>unsupported(),getApp:()=>unsupported(),grantPermission:()=>unsupported(),revokePermission:()=>unsupported(),disconnect:()=>unsupported()},
    data:{getSummary:()=>unsupported(),listAppData:()=>unsupported(),getAppData:()=>unsupported(),retrySync:()=>unsupported(),updateSyncConfiguration:()=>unsupported()},
    backup:{getSummary:()=>unsupported(),listBackups:()=>unsupported(),getBackup:()=>unsupported(),createBackup:()=>unsupported(),getPolicy:()=>unsupported(),updatePolicy:()=>unsupported(),planRestore:()=>unsupported(),startRestore:()=>unsupported(),getRestoreOperation:()=>unsupported()},
    privacy:{getSummary:()=>unsupported(),requestExport:()=>unsupported(),listExports:()=>unsupported(),getExport:()=>unsupported(),getExportContent:()=>unsupported(),planAppDataDeletion:()=>unsupported(),startAppDataDeletion:()=>unsupported(),planAccountDeletion:()=>unsupported(),requestAccountDeletion:()=>unsupported(),getAccountDeletion:()=>unsupported(),cancelAccountDeletion:()=>unsupported()},
    capabilities:{async getCapabilities(){return capabilities;}},
    async getOverview():Promise<Overview>{
      const {identity}=await getIdentityAndProfile();
      return {
        identity,
        capabilities,
        security:{attention:[],authMethod:"Google",twoStepVerification:"unavailable",recentActivity:[]},
        devices:[],
        apps:[],
        data:{totalStorageBytes:0,appCount:0,syncStatus:"unavailable",attentionCount:0,backupStatus:"none"},
      };
    },
  };
  return service;
}
