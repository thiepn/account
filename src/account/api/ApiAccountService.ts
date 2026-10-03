import { z } from "zod";
import type { AccountService } from "../service";
import type { AccountCapabilities, AccountError, AccountIdentity, AccountProfile, Overview } from "../types";
import { getAccountOAuthOrigin, getAccountSupabaseClient } from "./supabase";
import { consumeReturnTo, saveReturnTo } from "./returnTo";
import {parseHubNotesConsent} from './hubConsent';

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

const numericBigint=z.union([z.number(),z.string()]).transform((value)=>Number(value));
const nullableNumericBigint=z.union([z.number(),z.string(),z.null()]).transform((value)=>value===null?null:Number(value));
const inventoryRowSchema=z.object({
  app_slug:z.string(),
  app_name:z.string(),
  namespace_id:z.string(),
  namespace_status:z.enum(["active","retained","archived"]),
  record_count:numericBigint,
  storage_bytes:numericBigint,
  updated_at:z.string().nullable(),
  revision:nullableNumericBigint,
  schema_version:z.number().nullable(),
  sync_status:z.enum(["up-to-date","syncing","pending","delayed","offline","conflict","error","disabled","unavailable"]),
  last_successful_sync_at:z.string().nullable(),
  sync_supported:z.boolean(),
});

const backupInventoryRowSchema=z.object({
  backup_ref:z.string(),
  app_slug:z.string(),
  app_name:z.string(),
  created_at:z.string(),
  backup_status:z.enum(["verified","unverified","corrupted"]),
  backup_type:z.enum(["automatic","manual","pre-restore"]),
  size_bytes:numericBigint,
  source_revision:nullableNumericBigint,
  schema_version:z.number(),
  metadata:z.record(z.string(),z.unknown()),
});
const restoreOperationRowSchema=z.object({
  id:z.string().uuid(),
  backup_ref:z.string(),
  app_slug:z.string(),
  status:z.enum(["restoring","completed","failed"]),
  started_at:z.string(),
  completed_at:z.string().nullable(),
  safety_backup_ref:z.string().nullable(),
  result:z.record(z.string(),z.unknown()).nullable(),
  error_code:z.string().nullable(),
});
const exportRowSchema=z.object({
  id:z.string().uuid(),
  scope:z.enum(["account","selected-apps"]),
  app_slugs:z.array(z.string()).nullable(),
  status:z.enum(["ready","failed"]),
  requested_at:z.string(),
  completed_at:z.string(),
  expires_at:z.string(),
  size_bytes:numericBigint,
});
const accountDeletionRowSchema=z.object({
  id:z.string().uuid(),
  status:z.enum(["pending","deleting","completed","failed","cancelled"]),
  requested_at:z.string(),
  cancellable_until:z.string().nullable(),
  scheduled_deletion_at:z.string().nullable(),
  completed_at:z.string().nullable(),
  error_code:z.string().nullable(),
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
  dataRead:true,
  privacyRead:true,
};

function normalizedError(code:string,kind:AccountError["kind"],retryable:boolean):AccountError{return {code,kind,retryable};}
function mapRpcError(error:unknown,fallback:string):AccountError{
  if(error&&typeof error==="object"){
    const value=error as {code?:string;message?:string;status?:number};
    const message=value.message??"";
    if(message.includes("reauthentication_required"))return normalizedError("REAUTH_REQUIRED","authentication",false);
    if(message.includes("account_deletion_pending"))return normalizedError("ACCOUNT_DELETION_PENDING","conflict",false);
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

async function withTimeout<T>(promise:Promise<T>,ms:number,code:string):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([
      promise,
      new Promise<T>((_resolve,reject)=>{
        timer=setTimeout(()=>reject(normalizedError(code,"network",true)),ms);
      }),
    ]);
  } finally {
    if(timer)clearTimeout(timer);
  }
}

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

async function loadRealDataInventory(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const {data,error}=await supabase.rpc("get_thiepn_account_data_inventory");
  if(error)throw mapRpcError(error,"DATA_INVENTORY_FAILED");
  const parsed=z.array(inventoryRowSchema).safeParse(data??[]);
  if(!parsed.success)throw normalizedError("DATA_INVENTORY_SCHEMA_INVALID","server",false);
  return parsed.data.map((row)=>({
    appId:row.app_slug,
    appName:row.app_name,
    namespaceId:row.namespace_id,
    namespaceStatus:row.namespace_status,
    revision:row.revision??undefined,
    schemaVersion:row.schema_version??undefined,
    storageBytes:row.storage_bytes,
    storageApproximate:true,
    recordCount:row.record_count,
    updatedAt:row.updated_at??undefined,
    sync:{
      status:row.sync_status,
      lastAttemptAt:row.updated_at??undefined,
      lastSuccessfulSyncAt:row.last_successful_sync_at??undefined,
      lastDataChangeAt:row.updated_at??undefined,
    },
    configuration:{
      supported:row.sync_supported,
      enabled:row.namespace_status==="active"&&row.sync_supported,
      userControllable:false,
    },
    clients:[],
  }));
}

async function loadRealBackups(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const {data,error}=await supabase.rpc("get_thiepn_account_backup_inventory");
  if(error)throw mapRpcError(error,"BACKUP_INVENTORY_FAILED");
  const parsed=z.array(backupInventoryRowSchema).safeParse(data??[]);
  if(!parsed.success)throw normalizedError("BACKUP_INVENTORY_SCHEMA_INVALID","server",false);
  return parsed.data.map((row)=>({
    id:row.backup_ref,
    createdAt:row.created_at,
    status:row.backup_status,
    type:row.backup_type,
    destination:{
      type:"app-owned" as const,
      label:row.app_slug==="diet"?"Diet recovery storage":"TMS60 Account backup storage",
    },
    sizeBytes:row.size_bytes,
    integrity:{
      status:row.backup_status==="verified"?"verified" as const:row.backup_status==="corrupted"?"failed" as const:"pending" as const,
      verifiedAt:typeof row.metadata["verifiedAt"]==="string"?row.metadata["verifiedAt"]:undefined,
    },
    manifestVersion:1,
    apps:[{
      appId:row.app_slug,
      appName:row.app_name,
      namespaceId:`${row.app_slug}:default`,
      sourceGeneration:1,
      sourceRevision:row.source_revision??0,
      schemaVersion:row.schema_version,
      sizeBytes:row.size_bytes,
    }],
  }));
}

async function getRealBackupPolicy(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const {data,error}=await supabase
    .from("account_app_grants")
    .select("app_slug,status")
    .eq("permission_id","backup.include");
  if(error)throw mapError(error,"BACKUP_POLICY_READ_FAILED");
  const rows=z.array(z.object({app_slug:z.string(),status:z.enum(["granted","denied"])})).safeParse(data??[]);
  if(!rows.success)throw normalizedError("BACKUP_POLICY_SCHEMA_INVALID","server",false);
  const includedApps=rows.data.filter((row)=>row.status==="granted").map((row)=>row.app_slug);
  return {enabled:includedApps.length>0,frequency:"manual-only" as const,includedApps};
}

async function listRealExports(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const {data,error}=await supabase
    .from("account_export_requests")
    .select("id,scope,app_slugs,status,requested_at,completed_at,expires_at,size_bytes")
    .order("requested_at",{ascending:false});
  if(error)throw mapError(error,"EXPORT_LIST_FAILED");
  const parsed=z.array(exportRowSchema).safeParse(data??[]);
  if(!parsed.success)throw normalizedError("EXPORT_LIST_SCHEMA_INVALID","server",false);
  return parsed.data.map((row)=>({
    id:row.id,
    scope:row.scope,
    appIds:row.app_slugs??undefined,
    status:row.status==="failed"?"failed" as const:new Date(row.expires_at).getTime()<=Date.now()?"expired" as const:"ready" as const,
    requestedAt:row.requested_at,
    completedAt:row.completed_at,
    expiresAt:row.expires_at,
    sizeBytes:row.size_bytes,
  }));
}

async function getRealAccountDeletion(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const {data,error}=await supabase
    .from("account_deletion_requests")
    .select("id,status,requested_at,cancellable_until,scheduled_deletion_at,completed_at,error_code")
    .order("requested_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw mapError(error,"ACCOUNT_DELETION_READ_FAILED");
  if(!data)return null;
  const parsed=accountDeletionRowSchema.safeParse(data);
  if(!parsed.success)throw normalizedError("ACCOUNT_DELETION_SCHEMA_INVALID","server",false);
  return {
    id:parsed.data.id,
    status:parsed.data.status,
    requestedAt:parsed.data.requested_at,
    cancellableUntil:parsed.data.cancellable_until??undefined,
    scheduledDeletionAt:parsed.data.scheduled_deletion_at??undefined,
    completedAt:parsed.data.completed_at??undefined,
  };
}

async function getRealAccountStatus(supabase:ReturnType<typeof getAccountSupabaseClient>){
  const request=await getRealAccountDeletion(supabase);
  return request&&["pending","deleting"].includes(request.status)?"deletion-pending" as const:"active" as const;
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
      status:await getRealAccountStatus(supabase),
    };
    return {identity,profile};
  }

  const service:AccountService={
    auth:{
      async getState(){
        const {data:sessionData,error:sessionError}=await withTimeout(
          supabase.auth.getSession(),
          8000,
          "AUTH_SESSION_TIMEOUT",
        );
        if(sessionError)throw mapError(sessionError,"AUTH_SESSION_READ_FAILED");
        if(!sessionData.session)return "signed-out";
        const {data,error}=await withTimeout(
          supabase.auth.getUser(),
          8000,
          "AUTH_VERIFY_TIMEOUT",
        );
        if(error)throw mapError(error,"AUTH_SESSION_VERIFY_FAILED");
        return data.user?"signed-in":"session-expired";
      },
      async signIn(returnTo){
        sessionStorage.removeItem("thiepn.account.authPurpose");
        sessionStorage.removeItem("thiepn.account.expectedAccountId");
        saveReturnTo(returnTo??"/");
        const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${getAccountOAuthOrigin()}/auth/callback`}});
        if(error)throw mapError(error,"OAUTH_START_FAILED");
        return {redirecting:true};
      },
      async completeCallback(){
        const code=new URLSearchParams(window.location.search).get("code");
        if(!code)throw normalizedError("OAUTH_CODE_MISSING","authentication",false);
        const purpose=sessionStorage.getItem("thiepn.account.authPurpose");
        const expectedAccountId=sessionStorage.getItem("thiepn.account.expectedAccountId");
        const {error}=await supabase.auth.exchangeCodeForSession(code);
        if(error)throw mapError(error,"OAUTH_CALLBACK_FAILED");
        const user=await getUser();
        sessionStorage.removeItem("thiepn.account.authPurpose");
        sessionStorage.removeItem("thiepn.account.expectedAccountId");
        if(purpose==="reauth"&&expectedAccountId&&user.id!==expectedAccountId){
          await supabase.auth.signOut({scope:"local"});
          throw normalizedError("ACCOUNT_CHANGED_DURING_REAUTH","authentication",false);
        }
        return consumeReturnTo();
      },
      async isRecentlyAuthenticated(){
        const {data,error}=await supabase.rpc("get_thiepn_account_auth_assurance");
        if(error)throw mapRpcError(error,"AUTH_ASSURANCE_FAILED");
        const parsed=z.object({recent:z.boolean()}).safeParse(data);
        if(!parsed.success)throw normalizedError("AUTH_ASSURANCE_SCHEMA_INVALID","server",false);
        return parsed.data.recent;
      },
      async reauthenticate(returnTo){
        const user=await getUser();
        saveReturnTo(returnTo??"/");
        sessionStorage.setItem("thiepn.account.authPurpose","reauth");
        sessionStorage.setItem("thiepn.account.expectedAccountId",user.id);
        const {error}=await supabase.auth.signInWithOAuth({
          provider:"google",
          options:{
            redirectTo:`${getAccountOAuthOrigin()}/auth/callback`,
            queryParams:{prompt:"login"},
          },
        });
        if(error){
          sessionStorage.removeItem("thiepn.account.authPurpose");
          sessionStorage.removeItem("thiepn.account.expectedAccountId");
          throw mapError(error,"REAUTH_START_FAILED");
        }
        return {redirecting:true};
      },
      async signOut(){
        const {error}=await supabase.auth.signOut({scope:"local"});
        if(error)throw mapError(error,"SIGN_OUT_FAILED");
      },
      subscribe(listener){
        let active=true;
        const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
          // Supabase invokes auth callbacks while its internal auth lock can still be held.
          // Never trigger cache work or another auth call synchronously from this callback.
          setTimeout(()=>{
            if(active)listener(session?"signed-in":"signed-out");
          },0);
        });
        return ()=>{
          active=false;
          data.subscription.unsubscribe();
        };
      },
    },
    profile:{
      async getProfile(){return (await getIdentityAndProfile()).profile;},
      async updatePr…8850 tokens truncated…egistry().find((app)=>app.id===appId)??{id:appId,slug:appId,name:"Unknown THIEPN app",description:"This connection refers to an app that is no longer present in the current registry.",status:"disabled",supportedCapabilities:caps({backup:false,cloudSync:false,export:false,cloudDataDeletion:false}),availablePermissions:[]};
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
    hub:{async readConsent(){throw accountError('HUB_UNAVAILABLE','Hub sharing requires the Account backend.','unsupported',false);},async saveConsent(){throw accountError('HUB_UNAVAILABLE','Hub sharing requires the Account backend.','unsupported',false);}},
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
