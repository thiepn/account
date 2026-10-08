import {parseHubTmsConsent} from './hubTmsConsent';
import { z } from "zod";
import type { AccountService } from "../service";
import type { AccountCapabilities, AccountError, AccountIdentity, AccountProfile, Overview } from "../types";
import { getAccountOAuthOrigin, getAccountSupabaseClient } from "./supabase";
import { consumeReturnTo, saveReturnTo } from "./returnTo";
import {parseHubNotesConsent} from './hubConsent';
import {authorizationId,hubOAuthRedirect,parseHubOAuthDetails} from './hubOAuth';
import {oauthConsentRedirect,parseOAuthConsentDetails,type OAuthConsentDetails} from './oauthConsent';
import {createSingleFlight} from './singleFlight';
import {
  firstPartyOAuthRedirect,
  firstPartyOAuthRedirectTarget,
  firstPartyOAuthRequest,
  parseFirstPartyOAuthRegistration,
  parseFirstPartyOAuthResolvedRegistration,
} from './firstPartyOAuth';
import {parseSsoProbeRegistration} from './ssoProbe';

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
  product_url:z.string().regex(/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/),
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
const libraryFileInventorySchema=z.object({
  objectCount:numericBigint,
  storageBytes:numericBigint,
  updatedAt:z.string().nullable(),
  namespaceStatus:z.enum(["active","retained"]),
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
    supabase.from("account_apps").select("slug,name,description,path,product_url,sort_order,active").order("sort_order",{ascending:true}),
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
        productUrl:appRow?.product_url,
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
  const [inventoryResult,fileInventoryResult]=await Promise.all([
    supabase.rpc("get_thiepn_account_data_inventory"),
    supabase.rpc("get_thiepn_library_file_inventory"),
  ]);
  if(inventoryResult.error)throw mapRpcError(inventoryResult.error,"DATA_INVENTORY_FAILED");
  if(fileInventoryResult.error)throw mapRpcError(fileInventoryResult.error,"LIBRARY_FILE_INVENTORY_FAILED");
  const parsed=z.array(inventoryRowSchema).safeParse(inventoryResult.data??[]);
  if(!parsed.success)throw normalizedError("DATA_INVENTORY_SCHEMA_INVALID","server",false);
  const fileInventory=libraryFileInventorySchema.safeParse(fileInventoryResult.data);
  if(!fileInventory.success)throw normalizedError("LIBRARY_FILE_INVENTORY_SCHEMA_INVALID","server",false);

  const items=parsed.data.map((row)=>({
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

  if(fileInventory.data.objectCount>0){
    const library=items.find((item)=>item.appId==="library");
    if(library){
      library.storageBytes+=fileInventory.data.storageBytes;
      library.recordCount=(library.recordCount??0)+fileInventory.data.objectCount;
      if(fileInventory.data.updatedAt&&(!library.updatedAt||fileInventory.data.updatedAt>library.updatedAt)){
        library.updatedAt=fileInventory.data.updatedAt;
        library.sync.lastDataChangeAt=fileInventory.data.updatedAt;
      }
    }else{
      items.push({
        appId:"library",
        appName:"Library",
        namespaceId:"library:default",
        namespaceStatus:fileInventory.data.namespaceStatus,
        revision:undefined,
        schemaVersion:undefined,
        storageBytes:fileInventory.data.storageBytes,
        storageApproximate:true,
        recordCount:fileInventory.data.objectCount,
        updatedAt:fileInventory.data.updatedAt??undefined,
        sync:{
          status:"unavailable" as const,
          lastAttemptAt:fileInventory.data.updatedAt??undefined,
          lastSuccessfulSyncAt:undefined,
          lastDataChangeAt:fileInventory.data.updatedAt??undefined,
        },
        configuration:{supported:true,enabled:false,userControllable:false},
        clients:[],
      });
    }
  }

  return items;
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
  // PKCE codes are single-use. Replaying this callback (e.g. a React effect replay)
  // must join the existing exchange rather than consume the same code twice.
  let callbackFlight:Promise<string>|null=null;
  const consentDetailsSingleFlight=createSingleFlight<string,OAuthConsentDetails>();

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
    ssoProbe:{
      async check(clientId){
        const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
        if(sessionError)throw mapError(sessionError,'SSO_PROBE_UNAVAILABLE');

        let signedIn=false;
        if(sessionData.session){
          const {data:userData,error:userError}=await supabase.auth.getUser();
          if(userError)throw mapError(userError,'SSO_PROBE_UNAVAILABLE');
          signedIn=Boolean(userData.user&&!userData.user.is_anonymous);
        }

        const {data:resolved,error:resolveError}=await supabase.rpc(
          'resolve_thiepn_first_party_sso_probe',
          {p_client_id:clientId},
        );
        if(resolveError||!resolved)throw mapError(resolveError,'SSO_PROBE_UNAVAILABLE');
        return{
          signedIn,
          registration:parseSsoProbeRegistration(resolved,clientId),
        };
      },
    },
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
      completeCallback(){
        if(callbackFlight)return callbackFlight;
        const run=async()=>{
          const params=new URLSearchParams(window.location.search);
          const codes=params.getAll("code");
          if(codes.length!==1||!codes[0]||params.has("error"))
            throw normalizedError("OAUTH_CODE_MISSING","authentication",false);
          const purpose=sessionStorage.getItem("thiepn.account.authPurpose");
          const expectedAccountId=sessionStorage.getItem("thiepn.account.expectedAccountId");
          const {error}=await supabase.auth.exchangeCodeForSession(codes[0]);
          if(error)throw mapError(error,"OAUTH_CALLBACK_FAILED");
          const user=await getUser();
          sessionStorage.removeItem("thiepn.account.authPurpose");
          sessionStorage.removeItem("thiepn.account.expectedAccountId");
          if(purpose==="reauth"&&(!expectedAccountId||user.id!==expectedAccountId)){
            await supabase.auth.signOut({scope:"local"});
            throw normalizedError("ACCOUNT_CHANGED_DURING_REAUTH","authentication",false);
          }
          return consumeReturnTo();
        };
        const promise=run();
        callbackFlight=promise;
        // A failure must not permanently poison later sign-in attempts.
        void promise.finally(()=>{if(callbackFlight===promise)callbackFlight=null;}).catch(()=>{});
        return promise;
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
            if(active)listener(session?"signed-in":"signed-out",session?.user.id);
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
    hubTms:{
      async readConsent(translation){const {data,error}=await supabase.rpc('get_thiepn_hub_tms60_consent',{p_translation:translation});if(error)throw mapError(error,'HUB_CONSENT_UNAVAILABLE');return parseHubTmsConsent(data);},
      async saveConsent(translation,permissions,revision){const {data,error}=await supabase.rpc('set_thiepn_hub_tms60_consent',{p_translation:translation,p_permissions:permissions,p_expected_revision:revision});if(error)throw mapError(error,'HUB_CONSENT_SAVE_FAILED');return parseHubTmsConsent(data);},
    },
    hub:{
      async readConsent(){const {data,error}=await supabase.rpc('get_thiepn_hub_notes_consent');if(error)throw mapError(error,'HUB_CONSENT_UNAVAILABLE');return parseHubNotesConsent(data);},
      async saveConsent(permissions,revision){const {data,error}=await supabase.rpc('set_thiepn_hub_notes_consent',{p_permissions:permissions,p_expected_revision:revision});if(error)throw mapError(error,'HUB_CONSENT_SAVE_FAILED');return parseHubNotesConsent(data);},
    },
    oauthConsent:{
      details(id){
        return consentDetailsSingleFlight(id,async()=>{
        const hubEnabled=import.meta.env.VITE_HUB_OAUTH_ENABLED==='staged-v1';
        const financeEnabled=import.meta.env.VITE_FINANCE_MCP_OAUTH_ENABLED==='staged-v1';
        authorizationId(id);
        const {data:user,error:userError}=await supabase.auth.getUser();
        if(userError||!user.user)throw mapError(userError,'OAUTH_CONSENT_UNAVAILABLE');
        const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(id);
        if(error)throw mapError(error,'OAUTH_CONSENT_UNAVAILABLE');
        const {data:current,error:currentError}=await supabase.auth.getUser();
        if(currentError||current.user?.id!==user.user.id)throw mapError(currentError,'OAUTH_CONSENT_UNAVAILABLE');

        if(data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).join(',')==='redirect_url'){
          let target:string|null=null;
          try{target=firstPartyOAuthRedirectTarget((data as Record<string,unknown>).redirect_url);}catch{}
          if(target){
            const {data:resolved,error:resolveError}=await supabase.rpc('resolve_thiepn_first_party_oauth_redirect',{
              p_redirect_uri:target,
            });
            if(resolveError){
              if(!String(resolveError.message??'').includes('first_party_oauth_client_unavailable'))
                throw mapError(resolveError,'OAUTH_CONSENT_UNAVAILABLE');
            }else if(resolved){
              const registration=parseFirstPartyOAuthResolvedRegistration(resolved,target);
              if(!registration.automaticIdentityConsent)
                throw mapError(new Error('FIRST_PARTY_OAUTH_CONSENT_REQUIRED'),'OAUTH_CONSENT_UNAVAILABLE');
              const {data:connection,error:connectionError}=await supabase.from('account_app_connections')
                .select('status').eq('app_slug',registration.appSlug).eq('user_id',user.user.id).maybeSingle();
              if(connectionError)throw mapError(connectionError,'OAUTH_CONSENT_UNAVAILABLE');
              const validated=firstPartyOAuthRedirect((data as Record<string,unknown>).redirect_url,registration.redirectUri);
              if(connection?.status==='disconnected')return {
                authorizationId:id,owner:user.user.id,kind:'first-party-reconnect' as const,
                title:registration.appName,clientId:registration.clientId,appSlug:registration.appSlug,
                redirectUri:registration.redirectUri,approvedRedirectUrl:validated,
              };
              if(connection&&connection.status!=='connected'&&connection.status!=='limited')
                throw new Error('FIRST_PARTY_APP_INACTIVE');
              return{redirectUrl:validated};
            }
          }
        }else{
          let request:null|ReturnType<typeof firstPartyOAuthRequest>=null;
          try{request=firstPartyOAuthRequest(data,id,user.user.id);}catch{}
          if(request){
            const {data:resolved,error:resolveError}=await supabase.rpc('resolve_thiepn_first_party_oauth_client',{
              p_client_id:request.clientId,
              p_redirect_uri:request.redirectUri,
              p_scope:request.scope,
            });
            if(resolveError){
              if(!String(resolveError.message??'').includes('first_party_oauth_client_unavailable'))
                throw mapError(resolveError,'OAUTH_CONSENT_UNAVAILABLE');
            }else if(resolved){
              const registration=parseFirstPartyOAuthRegistration(resolved,request);
              if(!registration.automaticIdentityConsent)
                throw mapError(new Error('FIRST_PARTY_OAUTH_CONSENT_REQUIRED'),'OAUTH_CONSENT_UNAVAILABLE');
              const {data:connection,error:connectionReadError}=await supabase.from('account_app_connections')
                .select('status').eq('app_slug',registration.appSlug).eq('user_id',user.user.id).maybeSingle();
              if(connectionReadError)throw mapError(connectionReadError,'OAUTH_CONSENT_UNAVAILABLE');
              if(connection?.status==='disconnected')return {
                authorizationId:id,owner:user.user.id,kind:'first-party-reconnect' as const,
                title:registration.appName,clientId:registration.clientId,appSlug:registration.appSlug,
                redirectUri:registration.redirectUri,
              };
              if(connection&&connection.status!=='connected'&&connection.status!=='limited')
                throw new Error('FIRST_PARTY_APP_INACTIVE');

              const {error:connectionError}=await supabase.rpc('ensure_thiepn_first_party_app_connection',{
                p_client_id:registration.clientId,
                p_app_slug:registration.appSlug,
              });
              if(connectionError)throw mapError(connectionError,'OAUTH_CONSENT_UNAVAILABLE');

              const {data:approved,error:approvalError}=await supabase.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true});
              if(approvalError||!approved)throw mapError(approvalError,'OAUTH_CONSENT_UNAVAILABLE');

              const {data:verified,error:verifiedError}=await supabase.auth.getUser();
              if(verifiedError||verified.user?.id!==user.user.id)throw mapError(verifiedError,'OAUTH_CONSENT_UNAVAILABLE');
              return{redirectUrl:firstPartyOAuthRedirect(approved.redirect_url,registration.redirectUri)};
            }
          }
        }

        if(!hubEnabled&&!financeEnabled)return unsupported();
        return parseOAuthConsentDetails(data,id,user.user.id,{
          hubEnabled,
          hubClientId:import.meta.env.VITE_HUB_OAUTH_CLIENT_ID??'',
          financeEnabled,
        });
        });
      },
      async decide(id,owner,kind,approve){
        const details=await service.oauthConsent.details(id);
        if('redirectUrl' in details||details.owner!==owner||details.kind!==kind)throw new Error('OAUTH_CONSENT_UNAVAILABLE');
        if(details.kind==='first-party-reconnect'){
          const {data:active,error:activeError}=await supabase.auth.getUser();
          if(activeError||active.user?.id!==owner)throw mapError(activeError,'OAUTH_CONSENT_UNAVAILABLE');
          if(!approve&&details.approvedRedirectUrl){
            const declined=new URL(details.approvedRedirectUrl);
            declined.searchParams.delete('code');
            declined.searchParams.set('error','access_denied');
            return firstPartyOAuthRedirect(declined.href,details.redirectUri);
          }
          if(approve){
            const {error:connectionError}=await supabase.rpc('ensure_thiepn_first_party_app_connection',{
              p_client_id:details.clientId,p_app_slug:details.appSlug,
            });
            if(connectionError)throw mapError(connectionError,'OAUTH_CONSENT_UNAVAILABLE');
            if(details.approvedRedirectUrl)return firstPartyOAuthRedirect(details.approvedRedirectUrl,details.redirectUri);
          }
          const {data:result,error:resultError}=await (
            approve?supabase.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true})
              :supabase.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true})
          );
          if(resultError||!result)throw mapError(resultError,'OAUTH_CONSENT_UNAVAILABLE');
          const {data:confirmed,error:confirmedError}=await supabase.auth.getUser();
          if(confirmedError||confirmed.user?.id!==owner)throw mapError(confirmedError,'OAUTH_CONSENT_UNAVAILABLE');
          return firstPartyOAuthRedirect(result.redirect_url,details.redirectUri);
        }
        const {data,error}=await (approve?supabase.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}):supabase.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true}));
        if(error||!data)throw mapError(error,'OAUTH_CONSENT_UNAVAILABLE');
        const {data:current,error:currentError}=await supabase.auth.getUser();
        if(currentError||current.user?.id!==owner)throw mapError(currentError,'OAUTH_CONSENT_UNAVAILABLE');
        return oauthConsentRedirect(data.redirect_url,kind);
      },
    },
    hubOAuth:{
      async details(id){
        if(import.meta.env.VITE_HUB_OAUTH_ENABLED!=='staged-v1')return unsupported();
        authorizationId(id);
        const {data:user,error:userError}=await supabase.auth.getUser();
        if(userError||!user.user)throw mapError(userError,'HUB_OAUTH_UNAVAILABLE');
        const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(id);
        if(error)throw mapError(error,'HUB_OAUTH_UNAVAILABLE');
        const {data:current,error:currentError}=await supabase.auth.getUser();
        if(currentError||current.user?.id!==user.user.id)throw mapError(currentError,'HUB_OAUTH_UNAVAILABLE');
        return parseHubOAuthDetails(data,id,user.user.id,import.meta.env.VITE_HUB_OAUTH_CLIENT_ID??'');
      },
      async decide(id,owner,approve){
        const details=await service.hubOAuth.details(id);
        if('redirectUrl' in details || details.owner!==owner)throw new Error('HUB_OAUTH_UNAVAILABLE');
        const {data,error}=await (approve?supabase.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}):supabase.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true}));
        if(error||!data)throw mapError(error,'HUB_OAUTH_UNAVAILABLE');
        const {data:current,error:currentError}=await supabase.auth.getUser();
        if(currentError||current.user?.id!==owner)throw mapError(currentError,'HUB_OAUTH_UNAVAILABLE');
        return hubOAuthRedirect(data.redirect_url);
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
    data:{
      async getSummary(){
        const items=await loadRealDataInventory(supabase);
        const attention=items.filter((item)=>["delayed","conflict","error"].includes(item.sync.status)).length;
        const anyObservableSync=items.some((item)=>item.sync.status!=="unavailable");
        return {
          totalStorageBytes:items.reduce((sum,item)=>sum+item.storageBytes,0),
          storageApproximate:true,
          appCount:items.length,
          syncStatus:attention?"attention" as const:anyObservableSync?"healthy" as const:"unavailable" as const,
          attentionCount:attention,
          backupStatus:"none" as const,
        };
      },
      async listAppData(){return loadRealDataInventory(supabase);},
      async getAppData(appId){
        const items=await loadRealDataInventory(supabase);
        return items.find((item)=>item.appId===appId)??null;
      },
      async retrySync(){return unsupported();},
      async updateSyncConfiguration(){return unsupported();},
    },
    backup:{
      async getSummary(){
        const [backups,policy]=await Promise.all([loadRealBackups(supabase),getRealBackupPolicy(supabase)]);
        return {lastSuccessful:backups.find((item)=>item.status==="verified"),policy};
      },
      async listBackups(){return loadRealBackups(supabase);},
      async getBackup(id){
        const backups=await loadRealBackups(supabase);
        return backups.find((item)=>item.id===id)??null;
      },
      async createBackup(){
        const policy=await getRealBackupPolicy(supabase);
        if(!policy.includedApps.length)throw normalizedError("NO_BACKUP_APPS_INCLUDED","conflict",false);
        const startedAt=new Date().toISOString();
        const {data,error}=await supabase.rpc("create_thiepn_account_backup");
        if(error)throw mapRpcError(error,"BACKUP_CREATE_FAILED");
        const parsed=z.object({created:z.array(z.string())}).safeParse(data);
        if(!parsed.success)throw normalizedError("BACKUP_CREATE_SCHEMA_INVALID","server",false);
        if(!parsed.data.created.length)throw normalizedError("NO_BACKUP_DATA_AVAILABLE","conflict",false);
        return {
          id:`backup-op:${Date.now()}`,
          status:"completed" as const,
          startedAt,
          completedAt:new Date().toISOString(),
          backupId:parsed.data.created[0],
        };
      },
      async getPolicy(){return getRealBackupPolicy(supabase);},
      async updatePolicy(){return unsupported();},
      async planRestore(backupId,selectedApps){
        const backup=await service.backup.getBackup(backupId);
        if(!backup)throw normalizedError("BACKUP_NOT_FOUND","conflict",false);
        const app=backup.apps[0];
        const selected=app&&selectedApps.includes(app.appId)?[app.appId]:[];
        const blockers:string[]=[];
        const warnings:string[]=[];
        if(backup.status!=="verified")blockers.push("This backup is not verified.");
        if(!selected.length)blockers.push("Select the app in this backup to continue.");
        if(app?.appId==="diet")blockers.push("Diet restore requires the operator-reviewed recovery runbook and is not executable from the Account browser.");
        if(app?.appId==="tms60"){
          const live=await service.data.getAppData("tms60");
          if(live?.revision!==undefined&&live.revision>app.sourceRevision)warnings.push("Current TMS60 cloud data is newer than this backup.");
        }
        return {
          id:`real:${encodeURIComponent(backup.id)}`,
          backupId:backup.id,
          selectedApps:selected,
          blockers,
          warnings,
          safetySnapshotRequired:app?.appId==="tms60",
          requiresReauthentication:false,
          expiresAt:new Date(Date.now()+10*60_000).toISOString(),
        };
      },
      async startRestore(planId){
        if(!planId.startsWith("real:"))throw normalizedError("RESTORE_PLAN_INVALID","validation",false);
        const backupId=decodeURIComponent(planId.slice(5));
        if(!backupId.startsWith("tms60:"))throw normalizedError("RESTORE_NOT_BROWSER_EXECUTABLE","unsupported",false);
        const rawId=backupId.slice("tms60:".length);
        const idCheck=z.string().uuid().safeParse(rawId);
        if(!idCheck.success)throw normalizedError("BACKUP_ID_INVALID","validation",false);
        const {data,error}=await supabase.rpc("restore_thiepn_tms60_backup",{p_backup_id:idCheck.data});
        if(error)throw mapRpcError(error,"RESTORE_FAILED");
        const parsed=z.object({
          operationId:z.string().uuid(),
          status:z.literal("completed"),
          safetyBackupRef:z.string().nullable(),
          newRevision:numericBigint,
          translationId:z.string(),
        }).safeParse(data);
        if(!parsed.success)throw normalizedError("RESTORE_RESULT_SCHEMA_INVALID","server",false);
        return {
          id:parsed.data.operationId,
          backupId,
          selectedApps:["tms60"],
          status:"completed" as const,
          startedAt:new Date().toISOString(),
          completedAt:new Date().toISOString(),
          safetyBackupId:parsed.data.safetyBackupRef??undefined,
          appResults:[{appId:"tms60",status:"restored" as const,verified:true,newGeneration:parsed.data.newRevision}],
        };
      },
      async getRestoreOperation(id){
        const idCheck=z.string().uuid().safeParse(id);
        if(!idCheck.success)return null;
        const {data,error}=await supabase
          .from("account_restore_operations")
          .select("id,backup_ref,app_slug,status,started_at,completed_at,safety_backup_ref,result,error_code")
          .eq("id",idCheck.data)
          .maybeSingle();
        if(error)throw mapError(error,"RESTORE_OPERATION_READ_FAILED");
        if(!data)return null;
        const parsed=restoreOperationRowSchema.safeParse(data);
        if(!parsed.success)throw normalizedError("RESTORE_OPERATION_SCHEMA_INVALID","server",false);
        const result=parsed.data.result;
        const newRevision=typeof result?.["newRevision"]==="number"?result["newRevision"]:typeof result?.["newRevision"]==="string"?Number(result["newRevision"]):undefined;
        return {
          id:parsed.data.id,
          backupId:parsed.data.backup_ref,
          selectedApps:[parsed.data.app_slug],
          status:parsed.data.status==="completed"?"completed" as const:parsed.data.status==="failed"?"failed" as const:"restoring" as const,
          startedAt:parsed.data.started_at,
          completedAt:parsed.data.completed_at??undefined,
          safetyBackupId:parsed.data.safety_backup_ref??undefined,
          appResults:parsed.data.status==="completed"?[{
            appId:parsed.data.app_slug,
            status:"restored" as const,
            verified:true,
            newGeneration:newRevision,
          }]:parsed.data.status==="failed"?[{
            appId:parsed.data.app_slug,
            status:"failed" as const,
            verified:false,
            errorCode:parsed.data.error_code??"RESTORE_FAILED",
          }]:undefined,
        };
      },
    },
    privacy:{
      async getSummary(){
        const [exports,appData,accountDeletion]=await Promise.all([
          listRealExports(supabase),
          service.data.listAppData(),
          getRealAccountDeletion(supabase),
        ]);
        return {
          exportCount:exports.length,
          readyExportCount:exports.filter((item)=>item.status==="ready").length,
          storedAppCount:appData.length,
          retainedAppCount:appData.filter((item)=>item.namespaceStatus==="retained").length,
          accountStatus:accountDeletion&&["pending","deleting"].includes(accountDeletion.status)?"deletion-pending" as const:"active" as const,
          accountDeletion:accountDeletion??undefined,
        };
      },
      async requestExport(appIds){
        const {data,error}=await supabase.rpc("request_thiepn_account_export",{p_app_slugs:appIds?.length?appIds:null});
        if(error)throw mapRpcError(error,"EXPORT_REQUEST_FAILED");
        const id=z.string().uuid().safeParse(data);
        if(!id.success)throw normalizedError("EXPORT_REQUEST_SCHEMA_INVALID","server",false);
        const item=await service.privacy.getExport(id.data);
        if(!item)throw normalizedError("EXPORT_NOT_FOUND","server",false);
        return item;
      },
      async listExports(){return listRealExports(supabase);},
      async getExport(id){
        const items=await listRealExports(supabase);
        return items.find((item)=>item.id===id)??null;
      },
      async getExportContent(id){
        const idCheck=z.string().uuid().safeParse(id);
        if(!idCheck.success)throw normalizedError("EXPORT_ID_INVALID","validation",false);
        const {data,error}=await supabase.rpc("get_thiepn_account_export_payload",{p_export_id:idCheck.data});
        if(error)throw mapRpcError(error,"EXPORT_NOT_AVAILABLE");
        return JSON.stringify(data,null,2);
      },
      async planAppDataDeletion(appId){
        const {data,error}=await supabase.rpc("plan_thiepn_app_data_deletion",{p_app_slug:appId});
        if(error)throw mapRpcError(error,"APP_DELETION_PLAN_FAILED");
        const parsed=z.object({
          id:z.string().uuid(),
          appId:z.string(),
          storageBytes:numericBigint,
          blockers:z.array(z.string()),
          warnings:z.array(z.string()),
          backupImpact:z.string(),
          requiresReauthentication:z.boolean(),
          expiresAt:z.string(),
        }).safeParse(data);
        if(!parsed.success)throw normalizedError("APP_DELETION_PLAN_SCHEMA_INVALID","server",false);
        const detail=await service.apps.getApp(appId);
        const dataDetail=await service.data.getAppData(appId);
        return {
          id:parsed.data.id,
          appId:parsed.data.appId,
          appName:detail?.app.name??dataDetail?.appName??appId,
          storageBytes:parsed.data.storageBytes,
          blockers:parsed.data.blockers,
          warnings:parsed.data.warnings,
          backupImpact:parsed.data.backupImpact,
          requiresReauthentication:parsed.data.requiresReauthentication,
          expiresAt:parsed.data.expiresAt,
        };
      },
      async startAppDataDeletion(planId){
        const idCheck=z.string().uuid().safeParse(planId);
        if(!idCheck.success)throw normalizedError("DELETION_PLAN_INVALID","validation",false);

        const {data:planRow,error:planReadError}=await supabase
          .from("account_app_deletion_plans")
          .select("app_slug")
          .eq("id",idCheck.data)
          .maybeSingle();
        if(planReadError)throw mapError(planReadError,"DELETION_PLAN_READ_FAILED");
        if(!planRow)throw normalizedError("DELETION_PLAN_NOT_FOUND","validation",false);

        if(planRow.app_slug==="library"){
          const {error:authorizationError}=await supabase.rpc("authorize_thiepn_library_file_deletion",{p_plan_id:idCheck.data});
          if(authorizationError)throw mapRpcError(authorizationError,"LIBRARY_FILE_DELETION_AUTH_FAILED");

          const user=await getUser();
          const storage=supabase.storage.from("library-personal-books");
          for(;;){
            const {data:objects,error:listError}=await storage.list(user.id,{limit:100,offset:0,sortBy:{column:"name",order:"asc"}});
            if(listError)throw mapError(listError,"LIBRARY_FILE_LIST_FAILED");
            const paths=(objects??[]).filter((object)=>/^[a-f0-9]{64}\.(?:epub|pdf)$/i.test(object.name)).map((object)=>`${user.id}/${object.name}`);
            if(!paths.length)break;
            const {error:removeError}=await storage.remove(paths);
            if(removeError)throw mapError(removeError,"LIBRARY_FILE_DELETE_FAILED");
            if((objects??[]).length<100)break;
          }
        }

        const {data,error}=await supabase.rpc("execute_thiepn_app_data_deletion",{p_plan_id:idCheck.data});
        if(error)throw mapRpcError(error,"APP_DATA_DELETION_FAILED");
        const parsed=z.object({
          id:z.string().uuid(),
          appId:z.string(),
          status:z.literal("completed"),
          completedAt:z.string(),
        }).safeParse(data);
        if(!parsed.success)throw normalizedError("APP_DATA_DELETION_SCHEMA_INVALID","server",false);
        return {
          id:parsed.data.id,
          appId:parsed.data.appId,
          status:"completed" as const,
          startedAt:parsed.data.completedAt,
          completedAt:parsed.data.completedAt,
        };
      },
      async planAccountDeletion(){
        const {data,error}=await supabase.rpc("plan_thiepn_account_deletion");
        if(error)throw mapRpcError(error,"ACCOUNT_DELETION_PLAN_FAILED");
        const parsed=z.object({
          id:z.string().uuid(),
          appCount:z.number(),
          namespaceCount:z.number(),
          backupCount:z.number(),
          blockers:z.array(z.string()),
          warnings:z.array(z.string()),
          gracePeriodDays:z.number(),
          requiresReauthentication:z.boolean(),
          expiresAt:z.string(),
        }).safeParse(data);
        if(!parsed.success)throw normalizedError("ACCOUNT_DELETION_PLAN_SCHEMA_INVALID","server",false);
        return parsed.data;
      },
      async requestAccountDeletion(planId,confirmation){
        const idCheck=z.string().uuid().safeParse(planId);
        if(!idCheck.success)throw normalizedError("DELETION_PLAN_INVALID","validation",false);
        const {data,error}=await supabase.rpc("request_thiepn_account_deletion",{p_plan_id:idCheck.data,p_confirmation:confirmation});
        if(error)throw mapRpcError(error,"ACCOUNT_DELETION_REQUEST_FAILED");
        const parsed=z.object({
          id:z.string().uuid(),
          status:z.enum(["pending","deleting"]),
          requestedAt:z.string(),
          cancellableUntil:z.string().nullable(),
          scheduledDeletionAt:z.string().nullable(),
        }).safeParse(data);
        if(!parsed.success)throw normalizedError("ACCOUNT_DELETION_REQUEST_SCHEMA_INVALID","server",false);
        return {
          id:parsed.data.id,
          status:parsed.data.status,
          requestedAt:parsed.data.requestedAt,
          cancellableUntil:parsed.data.cancellableUntil??undefined,
          scheduledDeletionAt:parsed.data.scheduledDeletionAt??undefined,
        };
      },
      async getAccountDeletion(){return getRealAccountDeletion(supabase);},
      async cancelAccountDeletion(){
        const {data,error}=await supabase.rpc("cancel_thiepn_account_deletion");
        if(error)throw mapRpcError(error,"ACCOUNT_DELETION_CANCEL_FAILED");
        const parsed=z.object({
          id:z.string().uuid(),
          status:z.literal("cancelled"),
          requestedAt:z.string(),
          cancellableUntil:z.string().nullable(),
          scheduledDeletionAt:z.string().nullable(),
          completedAt:z.string().nullable(),
        }).safeParse(data);
        if(!parsed.success)throw normalizedError("ACCOUNT_DELETION_CANCEL_SCHEMA_INVALID","server",false);
        return {
          id:parsed.data.id,
          status:"cancelled" as const,
          requestedAt:parsed.data.requestedAt,
          cancellableUntil:parsed.data.cancellableUntil??undefined,
          scheduledDeletionAt:parsed.data.scheduledDeletionAt??undefined,
          completedAt:parsed.data.completedAt??undefined,
        };
      },
    },
    capabilities:{async getCapabilities(){return capabilities;}},
    async getOverview():Promise<Overview>{
      const {identity}=await getIdentityAndProfile();
      const [security,devices,apps,data,backup]=await Promise.all([
        service.security.getSummary(),
        service.devices.listDevices(),
        service.apps.listApps(),
        service.data.getSummary(),
        service.backup.getSummary(),
      ]);
      return {
        identity,
        capabilities,
        security,
        devices,
        apps,
        data:{
          ...data,
          lastBackupAt:backup.lastSuccessful?.createdAt,
          backupStatus:backup.lastSuccessful?"verified":data.backupStatus,
        },
      };
    },
  };
  return service;
}
