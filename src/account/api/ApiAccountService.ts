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

const sessionRowSchema=z.object({
  session_id:z.string().uuid(),
  created_at:z.string(),
  updated_at:z.string(),
  refreshed_at:z.string().nullable(),
  not_after:z.string().nullable(),
  user_agent:z.string().nullable(),
  aal:z.string().nullable(),
  is_current:z.boolean(),
});

const accountAppRowSchema=z.object({
  slug:z.string(),
  name:z.string(),
  description:z.string(),
  path:z.string(),
  sort_order:z.number(),
  active:z.boolean(),
});
const manifestRowSchema=z.object({
  app_slug:z.string(),
  core_app_id:z.string().nullable(),
  capabilities:z.record(z.string(),z.unknown()),
});
const permissionRowSchema=z.object({
  app_slug:z.string(),
  permission_id:z.string(),
  name:z.string(),
  description:z.string(),
  required:z.boolean(),
  mutable_by_user:z.boolean(),
  sensitivity:z.enum(["basic","sensitive"]),
  sort_order:z.number(),
  active:z.boolean(),
});
const connectionRowSchema=z.object({
  app_slug:z.string(),
  status:z.enum(["connected","limited","disconnected","suspended","error"]),
  connected_at:z.string(),
  last_used_at:z.string().nullable(),
  disconnected_at:z.string().nullable(),
});
const grantRowSchema=z.object({
  app_slug:z.string(),
  permission_id:z.string(),
  status:z.enum(["granted","denied"]),
  updated_at:z.string(),
});
type ProfileRow=z.infer<typeof profileRowSchema>;

const capabilities:AccountCapabilities={
  profileRead:true,
  profileWrite:true,
  securityRead:true,
  securityActivityRead:false,
  devicesRead:true,
  sessionRevocation:"others-only",
  deviceIdentity:"session-derived",
  appsRead:true,
  dataRead:false,
  privacyRead:false,
};

function normalizedError(code:string,kind:AccountError["kind"],retryable:boolean):AccountError{return {code,kind,retryable};}
function mapRpcError(error:unknown,fallback:string):AccountError{
  if(error&&typeof error==="object"){
    const value=error as {code?:string;message?:string;status?:number};
    const message=value.message??"";
    if(message.includes("permission_not_mutable"))return normalizedError("PERMISSION_NOT_MUTABLE","conflict",false);
    if(message.includes("connection_not_active"))return normalizedError("CONNECTION_NOT_ACTIVE","conflict",false);
    if(message.includes("permission_not_found"))return normalizedError("PERMISSION_NOT_FOUND","validation",false);
    if(message.includes("app_unavailable"))return normalizedError("APP_UNAVAILABLE","validation",false);
    if(value.code==="42501")return normalizedError("AUTHORIZATION_FAILED","authorization",false);
    if(value.code==="22023")return normalizedError(fallback,"validation",false);
  }
  return mapError(error,fallback);
}
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

function describeUserAgent(userAgent:string|null){
  const ua=userAgent??"";
  const platform=/Android/i.test(ua)?"Android":/iPhone|iPad|iPod/i.test(ua)?"iOS":/Windows/i.test(ua)?"Windows":/Macintosh|Mac OS X/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"Unknown platform";
  const clientName=/SamsungBrowser\//i.test(ua)?"Samsung Internet":/Edg\//i.test(ua)?"Edge":/Firefox\//i.test(ua)?"Firefox":/Chrome\//i.test(ua)?"Chrome":/Safari\//i.test(ua)?"Safari":"Browser";
  return {platform,clientName,label:`${clientName} on ${platform}`};
}

async function loadRealApps(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const [appsResult,manifestsResult,permissionsResult,connectionsResult,grantsResult]=await Promise.all([
    supabase.from("account_apps").select("slug,name,description,path,sort_order,active").order("sort_order",{ascending:true}),
    supabase.from("account_app_manifests").select("app_slug,core_app_id,capabilities"),
    supabase.from("account_app_permissions").select("app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order,active").order("sort_order",{ascending:true}),
    supabase.from("account_app_connections").select("app_slug,status,connected_at,last_used_at,disconnected_at"),
    supabase.from("account_app_grants").select("app_slug,permission_id,status,updated_at"),
  ]);
  for(const result of [appsResult,manifestsResult,permissionsResult,connectionsResult,grantsResult]){
    if(result.error)throw mapError(result.error,"APPS_READ_FAILED");
  }
  const apps=z.array(accountAppRowSchema).parse(appsResult.data??[]);
  const manifests=z.array(manifestRowSchema).parse(manifestsResult.data??[]);
  const permissions=z.array(permissionRowSchema).parse(permissionsResult.data??[]);
  const connections=z.array(connectionRowSchema).parse(connectionsResult.data??[]);
  const grants=z.array(grantRowSchema).parse(grantsResult.data??[]);
  const appMap=new Map(apps.map((row)=>[row.slug,row]));
  const manifestMap=new Map(manifests.map((row)=>[row.app_slug,row]));

  return connections.map((connection)=>{
    const appRow=appMap.get(connection.app_slug);
    const manifest=manifestMap.get(connection.app_slug);
    const appPermissions=permissions.filter((permission)=>permission.app_slug===connection.app_slug&&permission.active);
    const appGrants=grants.filter((grant)=>grant.app_slug===connection.app_slug);
    const grantMap=new Map(appGrants.map((grant)=>[grant.permission_id,grant]));
    const rawCaps=manifest?.capabilities??{};
    const availablePermissions=appPermissions.map((permission)=>({
      id:permission.permission_id,
      name:permission.name,
      description:permission.description,
      required:permission.required,
      mutableByUser:permission.mutable_by_user,
      sensitivity:permission.sensitivity,
    }));
    const grantedPermissions=availablePermissions.map((permission)=>{
      const grant=grantMap.get(permission.id);
      return {
        permissionId:permission.id,
        status:grant?.status??"denied" as const,
        updatedAt:grant?.updated_at??connection.connected_at,
      };
    });
    const requiredMissing=availablePermissions.some((permission)=>permission.required&&!grantedPermissions.some((grant)=>grant.permissionId===permission.id&&grant.status==="granted"));
    const effectiveStatus=connection.status==="connected"&&requiredMissing?"limited":connection.status;
    return {
      app:{
        id:connection.app_slug,
        slug:connection.app_slug,
        name:appRow?.name??"Unknown THIEPN app",
        description:appRow?.description??"This connection refers to an app that is no longer active in the Account registry.",
        status:appRow?.active===false?"disabled" as const:"active" as const,
        productUrl:appRow?.path?`https://thiepn.dev${appRow.path}`:undefined,
        supportedCapabilities:{
          accountIdentity:true,
          cloudSync:Boolean(rawCaps["sync"]||rawCaps["cloud_saves"]),
          backup:Boolean(rawCaps["backups"]),
          export:Boolean(rawCaps["export_data"]||rawCaps["platformExport"]),
          cloudDataDeletion:Boolean(rawCaps["delete_app_data"]||rawCaps["ecosystemDeletion"]),
          permissionManagement:true,
        },
        availablePermissions,
      },
      connection:{
        appId:connection.app_slug,
        status:effectiveStatus,
        connectedAt:connection.connected_at,
        lastUsedAt:connection.last_used_at??undefined,
        grantedPermissions,
      },
      coreAppId:manifest?.core_app_id??undefined,
    };
  });
}

async function listRealSessions(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const {data,error}=await supabase.rpc("list_thiepn_account_sessions");
  if(error)throw mapError(error,"SESSION_LIST_FAILED");
  const parsed=z.array(sessionRowSchema).safeParse(data??[]);
  if(!parsed.success)throw normalizedError("SESSION_SCHEMA_INVALID","server",false);
  return parsed.data.map((row)=>{
    const environment=describeUserAgent(row.user_agent);
    const expired=Boolean(row.not_after&&new Date(row.not_after).getTime()<=Date.now());
    return {
      id:row.session_id,
      deviceId:`session:${row.session_id}`,
      createdAt:row.created_at,
      lastActivityAt:row.updated_at||row.created_at,
      authMethod:"Google" as const,
      clientName:environment.clientName,
      current:row.is_current,
      status:expired?"expired" as const:"active" as const,
      environment,
    };
  });
}

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
    security:{
      async getSummary(){
        const factors=await supabase.auth.mfa.listFactors();
        if(factors.error)throw mapError(factors.error,"MFA_LIST_FAILED");
        const verified=[...factors.data.totp,...factors.data.phone].filter((factor)=>factor.status==="verified");
        return {
          attention:[],
          authMethod:"Google" as const,
          twoStepVerification:verified.length?"enabled" as const:"disabled" as const,
          recentActivity:[],
        };
      },
      async listActivity(){return [];},
      async getEvent(){return null;},
    },
    devices:{
      async listSessions(){
        const sessions=await listRealSessions(supabase);
        return sessions.filter((session)=>session.status==="active").map(({environment:_,...session})=>session);
      },
      async listDevices(){
        const sessions=await listRealSessions(supabase);
        return sessions.filter((session)=>session.status==="active").map((session)=>({
          id:session.deviceId,
          label:session.environment.label,
          platform:session.environment.platform,
          current:session.current,
          firstSeenAt:session.createdAt,
          lastActivityAt:session.lastActivityAt,
          sessions:[{
            id:session.id,
            deviceId:session.deviceId,
            createdAt:session.createdAt,
            lastActivityAt:session.lastActivityAt,
            authMethod:session.authMethod,
            clientName:session.clientName,
            current:session.current,
            status:session.status,
          }],
        }));
      },
      async getDevice(id){
        const devices=await service.devices.listDevices();
        return devices.find((device)=>device.id===id)??null;
      },
      async revokeSession(){return unsupported();},
      async revokeDevice(){return unsupported();},
      async revokeOtherSessions(){
        const {error}=await supabase.auth.signOut({scope:"others"});
        if(error)throw mapError(error,"REVOKE_OTHER_SESSIONS_FAILED");
      },
    },
    apps:{
      async listApps(){
        const details=await loadRealApps(supabase);
        return details
          .filter(({connection})=>!["disconnected","suspended"].includes(connection.status))
          .map(({app,connection})=>({
            id:app.id,
            name:app.name,
            status:connection.status==="limited"?"limited" as const:connection.status==="error"?"error" as const:"connected" as const,
            lastUsedAt:connection.lastUsedAt,
            permissionCount:connection.grantedPermissions.filter((permission)=>permission.status==="granted").length,
          }));
      },
      async getApp(appId){
        const details=await loadRealApps(supabase);
        const detail=details.find(({app})=>app.id===appId);
        return detail?{app:detail.app,connection:detail.connection}:null;
      },
      async grantPermission(appId,permissionId){
        const {error}=await supabase.rpc("set_thiepn_app_permission",{p_app_slug:appId,p_permission_id:permissionId,p_granted:true});
        if(error)throw mapRpcError(error,"PERMISSION_GRANT_FAILED");
        const detail=await service.apps.getApp(appId);
        if(!detail)throw normalizedError("CONNECTION_NOT_FOUND","conflict",false);
        return detail;
      },
      async revokePermission(appId,permissionId){
        const {error}=await supabase.rpc("set_thiepn_app_permission",{p_app_slug:appId,p_permission_id:permissionId,p_granted:false});
        if(error)throw mapRpcError(error,"PERMISSION_REVOKE_FAILED");
        const detail=await service.apps.getApp(appId);
        if(!detail)throw normalizedError("CONNECTION_NOT_FOUND","conflict",false);
        return detail;
      },
      async disconnect(appId){
        const {error}=await supabase.rpc("disconnect_thiepn_app",{p_app_slug:appId});
        if(error)throw mapRpcError(error,"APP_DISCONNECT_FAILED");
      },
    },
    data:{getSummary:()=>unsupported(),listAppData:()=>unsupported(),getAppData:()=>unsupported(),retrySync:()=>unsupported(),updateSyncConfiguration:()=>unsupported()},
    backup:{getSummary:()=>unsupported(),listBackups:()=>unsupported(),getBackup:()=>unsupported(),createBackup:()=>unsupported(),getPolicy:()=>unsupported(),updatePolicy:()=>unsupported(),planRestore:()=>unsupported(),startRestore:()=>unsupported(),getRestoreOperation:()=>unsupported()},
    privacy:{getSummary:()=>unsupported(),requestExport:()=>unsupported(),listExports:()=>unsupported(),getExport:()=>unsupported(),getExportContent:()=>unsupported(),planAppDataDeletion:()=>unsupported(),startAppDataDeletion:()=>unsupported(),planAccountDeletion:()=>unsupported(),requestAccountDeletion:()=>unsupported(),getAccountDeletion:()=>unsupported(),cancelAccountDeletion:()=>unsupported()},
    capabilities:{async getCapabilities(){return capabilities;}},
    async getOverview():Promise<Overview>{
      const {identity}=await getIdentityAndProfile();
      return {
        identity,
        capabilities,
        security:await service.security.getSummary(),
        devices:await service.devices.listDevices(),
        apps:await service.apps.listApps(),
        data:{totalStorageBytes:0,appCount:0,syncStatus:"unavailable",attentionCount:0,backupStatus:"none"},
      };
    },
  };
  return service;
}
