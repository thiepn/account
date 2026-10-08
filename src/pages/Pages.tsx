import { z } from "zod";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useAppData, useAppDataList, useApps, useBackup, useBackups, useBackupSummary, useCapabilities, useCreateBackup, useDataSummary, useDevices, useDisconnectApp, useGrantPermission, useOverview, usePrivacySummary, useAccountDeletion, useCancelAccountDeletion, useExport, useExports, usePlanAccountDeletion, usePlanAppDataDeletion, usePlanRestore, useProfile, useRequestAccountDeletion, useRequestExport, useRestoreOperation, useRetrySync, useRevokeOtherSessions, useRevokePermission, useSecurity, useSecurityActivity, useSecurityEvent, useStartAppDataDeletion, useStartRestore, useUpdateProfile, useUpdateSyncConfiguration } from "../account/hooks";
import { useAccountService } from "../account/context";
import { useTheme } from "../app/theme";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Notice } from "../components/ui/Notice";
import { useSensitiveAction } from "../account/useSensitiveAction";
import { Boxes, ChevronRight, CloudCog, Laptop2, ShieldCheck } from "lucide-react";

function PageHeader({title,description}:{title:string;description:string}){return <header className="page-header"><div className="page-color-strip" aria-hidden="true"><span/><span/><span/><span/></div><h1>{title}</h1><p>{description}</p></header>;}
function Loading(){return <div className="loading-card" aria-label="Loading"><div className="loading-shimmer"/></div>;}

export function OverviewPage(){
  const q=useOverview();
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <div>Could not load the account overview.</div>;
  const {identity,security,devices,apps,data}=q.data;
  const sessionCount=devices.reduce((sum,device)=>sum+device.sessions.length,0);
  const initial=identity.displayName.trim().charAt(0).toUpperCase()||"T";
  const securityValue=!q.data.capabilities.securityRead?"Unavailable":security.attention.length?"Review":"Protected";
  const backupValue=!q.data.capabilities.dataRead?"Unavailable":data.backupStatus==="verified"?"Verified":data.backupStatus==="failed"?"Needs attention":"Not configured";

  return <>
    <PageHeader title="Your account" description="Manage your THIEPN profile, security, connected apps and data."/>
    {identity.status==="deletion-pending"?<Notice tone="warning">Account deletion is pending. Account-changing actions are restricted until the lifecycle completes or is cancelled.</Notice>:null}
    {security.attention.length?<div className="mt-4"><Notice tone="warning">{security.attention[0]}</Notice></div>:null}

    <h2 className="section-title">Profile</h2>
    <div className="overview-profile">
      <div className="overview-profile-avatar" aria-hidden="true">{initial}</div>
      <div className="overview-profile-copy"><h2>{identity.displayName}</h2><p>{identity.primaryEmail}</p></div>
      <div className="overview-profile-meta"><StatusBadge tone={identity.status==="active"?"success":"warning"}>{identity.status}</StatusBadge><Link className="ui-button ui-button-secondary no-underline" to="/profile">Edit profile</Link></div>
    </div>

    <h2 className="section-title">Account settings</h2>
    <div className="overview-links">
      <Link className="overview-link-row" data-tone="purple" to="/security">
        <span className="overview-link-icon"><ShieldCheck size={18}/></span>
        <span className="overview-link-copy"><strong>Security</strong><small>Sign-in method, protection and recent activity</small></span>
        <span className="overview-link-value"><strong>{securityValue}</strong><ChevronRight size={16}/></span>
      </Link>
      <Link className="overview-link-row" data-tone="blue" to="/security#sessions">
        <span className="overview-link-icon"><Laptop2 size={18}/></span>
        <span className="overview-link-copy"><strong>Where you're signed in</strong><small>Review and sign out Account sessions</small></span>
        <span className="overview-link-value"><strong>{q.data.capabilities.devicesRead?`${sessionCount} active`:"Unavailable"}</strong><ChevronRight size={16}/></span>
      </Link>
      <Link className="overview-link-row" data-tone="peach" to="/apps">
        <span className="overview-link-icon"><Boxes size={18}/></span>
        <span className="overview-link-copy"><strong>Connected apps</strong><small>Manage app connections and permissions</small></span>
        <span className="overview-link-value"><strong>{q.data.capabilities.appsRead?`${apps.length} connected`:"Unavailable"}</strong><ChevronRight size={16}/></span>
      </Link>
      <Link className="overview-link-row" data-tone="mint" to="/data">
        <span className="overview-link-icon"><CloudCog size={18}/></span>
        <span className="overview-link-copy"><strong>Data & Backup</strong><small>Cloud data, sync and recovery snapshots</small></span>
        <span className="overview-link-value"><strong>{backupValue}</strong><ChevronRight size={16}/></span>
      </Link>
    </div>
  </>;
}
const profileSchema=z.object({
  displayName:z.string().trim().min(1,"Enter a display name.").max(80,"Display name must be 80 characters or fewer.").refine((value)=>!/[\u0000-\u001F\u007F]/u.test(value),"Display name contains unsupported control characters."),
  preferredLanguage:z.string().min(2).max(16),
  timezone:z.string().min(1).max(64),
});
type ProfileForm=z.infer<typeof profileSchema>;

function supportedTimezones(){
  try{
    const fn=(Intl as typeof Intl & {supportedValuesOf?:(key:"timeZone")=>string[]}).supportedValuesOf;
    return fn ? fn("timeZone") : ["Europe/Berlin","UTC","Asia/Seoul","America/New_York"];
  }catch{return ["Europe/Berlin","UTC","Asia/Seoul","America/New_York"];}
}

export function ProfilePage(){
  const profile=useProfile();
  const overview=useOverview();
  const update=useUpdateProfile();
  const theme=useTheme();
  const [serverMessage,setServerMessage]=useState<string|null>(null);
  const timezones=useMemo(supportedTimezones,[]);
  const form=useForm<ProfileForm>({defaultValues:{displayName:"",preferredLanguage:"English",timezone:"Europe/Berlin"}});
  const {register,handleSubmit,reset,setError,formState:{errors,isDirty}}=form;

  useEffect(()=>{
    if(profile.data&&!isDirty)reset({displayName:profile.data.displayName,preferredLanguage:profile.data.preferredLanguage,timezone:profile.data.timezone});
  },[profile.data,isDirty,reset]);

  useEffect(()=>{
    if(!isDirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[isDirty]);

  if(profile.isLoading||overview.isLoading)return <Loading/>;
  if(!profile.data||!overview.data)return <div>Could not load the profile.</div>;

  async function onSubmit(values:ProfileForm){
    setServerMessage(null);
    const parsed=profileSchema.safeParse(values);
    if(!parsed.success){
      for(const issue of parsed.error.issues){
        const field=issue.path[0];
        if(field==="displayName"||field==="preferredLanguage"||field==="timezone")setError(field,{message:issue.message});
      }
      return;
    }
    try{
      const saved=await update.mutateAsync(parsed.data);
      reset({displayName:saved.displayName,preferredLanguage:saved.preferredLanguage,timezone:saved.timezone});
      setServerMessage("Profile updated.");
    }catch{
      setServerMessage("Your profile could not be updated. Your edits are still here.");
    }
  }

  const identity=overview.data.identity;
  return <>
    <PageHeader title="Profile" description="Your THIEPN identity and account-level preferences."/>
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      {serverMessage?<Notice tone={serverMessage==="Profile updated."?"success":"error"}>{serverMessage}</Notice>:null}
      {isDirty?<Notice>You have unsaved profile changes.</Notice>:null}
      <Panel title="Profile information" className="ui-panel-accent-pink profile-accent-card" description="This name is shown across THIEPN apps that use your basic account identity.">
        <div className="profile-row">
          <div className="profile-avatar" aria-hidden="true">{profile.data.displayName.trim().charAt(0).toUpperCase()||"?"}</div>
          <div className="field grow">
            <label htmlFor="display-name">Display name</label>
            <input id="display-name" autoComplete="name" maxLength={80} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName?"display-name-error":undefined} {...register("displayName")}/>
            {errors.displayName?<p id="display-name-error" className="field-error">{errors.displayName.message}</p>:<p className="field-help">1–80 characters.</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Account identity" className="ui-panel-accent-purple profile-accent-identity" description="Authentication identity is managed separately from your editable profile.">
        <dl className="detail-grid">
          <div><dt>Primary email</dt><dd>{identity.primaryEmail} {identity.emailVerified?"· Verified":""}</dd></div>
          <div><dt>Sign-in provider</dt><dd>Google</dd></div>
          <div><dt>Account ID</dt><dd className="font-mono text-sm">{identity.accountId}</dd></div>
          <div><dt>Created</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"long"}).format(new Date(identity.createdAt))}</dd></div>
        </dl>
      </Panel>

      <Panel title="Preferences" className="ui-panel-accent-yellow profile-accent-preferences" description="Account-level display preferences.">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="language">Language</label>
            <select id="language" {...register("preferredLanguage")}>
              <option>English</option><option>Deutsch</option><option>한국어</option><option>Türkçe</option><option>Français</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <select id="timezone" {...register("timezone")}>
              {timezones.map((zone)=><option key={zone} value={zone}>{zone}</option>)}
            </select>
            {errors.timezone?<p className="field-error">{errors.timezone.message}</p>:null}
          </div>
          <div className="field">
            <label>Theme</label>
            <button type="button" className="secondary-button justify-start" onClick={theme.cycle}>Theme: {theme.mode}</button>
            <p className="field-help">Theme stays on this device until backend preference sync is intentionally integrated.</p>
          </div>
        </div>
      </Panel>

      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={!isDirty||update.isPending} onClick={()=>{reset({displayName:profile.data!.displayName,preferredLanguage:profile.data!.preferredLanguage,timezone:profile.data!.timezone});setServerMessage(null);}}>Discard changes</button>
        <button type="submit" className="primary-button" disabled={!isDirty||update.isPending}>{update.isPending?"Saving…":"Save changes"}</button>
      </div>
    </form>
  </>;
}

export function SecurityPage(){
  const q=useSecurity();
  const capabilities=useCapabilities();
  const sessions=useDevices();
  const revokeOthers=useRevokeOtherSessions();
  const [confirmRevokeOthers,setConfirmRevokeOthers]=useState(false);
  const [revokeError,setRevokeError]=useState(false);
  if(q.isLoading||capabilities.isLoading||sessions.isLoading)return <Loading/>;
  if(!q.data)return <div>Could not load security status.</div>;

  const environments=sessions.data??[];
  const current=environments.find((environment)=>environment.current);
  const others=environments.filter((environment)=>!environment.current);
  const grouped=Array.from(others.reduce((groups,environment)=>{
    const key=`${environment.label}\u0000${environment.platform}`;
    const existing=groups.get(key);
    const count=environment.sessions.length||1;
    if(existing){
      existing.sessionCount+=count;
      if(new Date(environment.lastActivityAt).getTime()>new Date(existing.lastActivityAt).getTime())existing.lastActivityAt=environment.lastActivityAt;
    }else{
      groups.set(key,{label:environment.label,platform:environment.platform,sessionCount:count,lastActivityAt:environment.lastActivityAt});
    }
    return groups;
  },new Map<string,{label:string;platform:string;sessionCount:number;lastActivityAt:string}>()).values())
    .sort((a,b)=>new Date(b.lastActivityAt).getTime()-new Date(a.lastActivityAt).getTime());

  const otherSessionCount=grouped.reduce((sum,group)=>sum+group.sessionCount,0);
  const canRevokeOthers=capabilities.data?.sessionRevocation==="individual"||capabilities.data?.sessionRevocation==="others-only";

  return <><PageHeader title="Security" description="Sign-in, protection and active Account sessions."/><div className="space-y-4">
    {q.data.attention.length?<Notice tone="warning">{q.data.attention[0]}</Notice>:null}
    <Panel title="Sign-in method" className="ui-panel-accent-purple ui-panel-soft-purple"><div className="flex items-center justify-between gap-4"><p className="text-sm">{q.data.authMethod}</p><StatusBadge tone="success">Connected</StatusBadge></div></Panel>
    <Panel title="Additional protection" className="ui-panel-accent-mint"><div className="flex items-center justify-between gap-4"><div><p className="m-0 text-sm font-medium">Two-step verification</p><p className="mt-1 text-sm text-[var(--muted)]">Status is read from your THIEPN Account authentication factors.</p></div><StatusBadge tone={q.data.twoStepVerification==="enabled"?"success":"neutral"}>{q.data.twoStepVerification}</StatusBadge></div></Panel>
    <Panel title="Where you're signed in" description="Browser sessions are grouped by browser and operating system." className="ui-panel-accent-blue">
      <div id="sessions" className="space-y-4 scroll-mt-20">
        {current?<div className="security-current-session rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-4"><div className="flex items-center justify-between gap-4"><div><p className="m-0 text-sm font-semibold">{current.label}</p><p className="mt-1 text-xs text-[var(--muted)]">Current session · active now</p></div><StatusBadge tone="success">Current</StatusBadge></div></div>:null}
        {grouped.length?<div className="device-list">{grouped.map((group)=><div className="device-row" key={`${group.label}-${group.platform}`}><div><strong>{group.label}</strong><small>{group.sessionCount} session{group.sessionCount===1?"":"s"} · Last active {new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(group.lastActivityAt))}</small></div><StatusBadge>Active</StatusBadge></div>)}</div>:<EmptyState title="No other sessions" description="Only your current Account session is active."/>}
        {otherSessionCount>0&&canRevokeOthers?<div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><p className="m-0 text-xs text-[var(--muted)]">{otherSessionCount} other active session{otherSessionCount===1?"":"s"} across {grouped.length} browser environment{grouped.length===1?"":"s"}.</p><Button variant="secondary" disabled={revokeOthers.isPending} onClick={()=>{setRevokeError(false);setConfirmRevokeOthers(true);}}>Sign out all other sessions</Button></div>:null}
        {revokeError?<Notice tone="error">Other sessions could not be signed out. Your current session was not intentionally changed; refresh this page to verify session status.</Notice>:null}
      </div>
    </Panel>
    <ConfirmDialog
      open={confirmRevokeOthers}
      title="Sign out all other sessions?"
      description="This signs your Account out of other browser sessions. You will stay signed in here. Other apps may have separate sessions."
      confirmLabel="Sign out other sessions"
      pending={revokeOthers.isPending}
      onCancel={()=>setConfirmRevokeOthers(false)}
      onConfirm={async()=>{
        try{
          await revokeOthers.mutateAsync();
          setConfirmRevokeOthers(false);
          setRevokeError(false);
        }catch{
          setRevokeError(true);
          setConfirmRevokeOthers(false);
        }
      }}
    />
    <Panel title="Recent security activity" description="Important sign-ins and Account security changes." className="ui-panel-accent-peach">
      {capabilities.data?.securityActivityRead
        ? <><div className="activity-list">{q.data.recentActivity.map((event)=><Link className="activity-row" key={event.id} to={`/security/activity/${event.id}`}><span><strong>{event.title}</strong><small>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.occurredAt))}</small></span><StatusBadge tone={event.severity==="warning"?"warning":event.severity==="critical"?"danger":"neutral"}>{event.category}</StatusBadge></Link>)}</div><Link className="inline-link" to="/security/activity">View all activity</Link></>
        : <p className="m-0 text-sm text-[var(--muted)]">Detailed Account security-event history is not available from the current production backend yet.</p>}
    </Panel>
  </div></>;
}
export function SecurityActivityPage(){
  const q=useSecurityActivity();
  const [filter,setFilter]=useState<"all"|"authentication"|"security"|"apps"|"account">("all");
  if(q.isLoading)return <Loading/>;
  const events=(q.data??[]).filter((event)=>filter==="all"||event.category===filter);
  return <><PageHeader title="Security activity" description="A chronological record of important Account security changes."/>
    <div className="filter-row" aria-label="Activity filter">{(["all","authentication","security","apps","account"] as const).map((value)=><button key={value} className={filter===value?"filter-chip filter-chip-active":"filter-chip"} onClick={()=>setFilter(value)}>{value==="all"?"All":value[0]?.toUpperCase()+value.slice(1)}</button>)}</div>
    <Panel title="Activity">{events.length?<div className="activity-list">{events.map((event)=><Link className="activity-row" key={event.id} to={`/security/activity/${event.id}`}><span><strong>{event.title}</strong><small>{event.description}</small></span><time>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(event.occurredAt))}</time></Link>)}</div>:<EmptyState title="No matching activity" description="No Account security events match this filter."/ >}</Panel>
  </>;
}

export function SecurityEventPage(){
  const {eventId}=useParams();
  const q=useSecurityEvent(eventId);
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="Activity unavailable" description="This Account activity record could not be found."/><Link className="inline-link" to="/security/activity">Back to security activity</Link></>;
  const event=q.data;
  return <><PageHeader title={event.title} description={event.description}/><Panel title="Event details"><dl className="detail-grid"><div><dt>Category</dt><dd>{event.category}</dd></div><div><dt>Time</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeStyle:"medium"}).format(new Date(event.occurredAt))}</dd></div>{event.deviceId?<div><dt>Session environment</dt><dd><Link className="inline-link" to="/security#sessions">Review active sessions</Link></dd></div>:null}<div><dt>Event ID</dt><dd className="font-mono text-sm">{event.id}</dd></div></dl></Panel></>;
}

export function AppsPage(){
  const q=useApps();
  if(q.isLoading)return <Loading/>;
  const apps=q.data??[];
  return <><PageHeader title="Apps" description="Applications currently connected to your THIEPN Account."/>
    {apps.length?<div className="app-grid">{apps.map((app,index)=><Link key={app.id} to={`/apps/${app.id}`} className="block h-full no-underline"><Panel title="" className={["app-tile",["ui-panel-accent-purple","ui-panel-accent-blue","ui-panel-accent-mint","ui-panel-accent-peach","ui-panel-accent-pink"][index%5]].join(" ")}><div className="app-card-row"><span className="app-card-icon" data-tone={index%5}>{app.name.trim().charAt(0).toUpperCase()}</span><span className="app-card-copy"><strong>{app.name}</strong><small>{app.permissionCount} granted permission{app.permissionCount===1?"":"s"} · Manage connection and Account access</small></span><StatusBadge tone={app.status==="limited"?"warning":app.status==="error"?"danger":"success"}>{app.status}</StatusBadge><ChevronRight size={16} className="text-[var(--muted)]"/></div></Panel></Link>)}</div>:<Panel title="Connected apps" className="ui-panel-accent-peach"><EmptyState title="No connected apps" description="Apps will appear here after they connect to your THIEPN Account."/></Panel>}
  </>;
}
export function AppDetailPage(){
  const {appId}=useParams();
  const q=useApp(appId);
  const grant=useGrantPermission();
  const revoke=useRevokePermission();
  const disconnect=useDisconnectApp();
  const navigate=useNavigate();
  const runSensitive=useSensitiveAction();
  const [disconnectOpen,setDisconnectOpen]=useState(false);
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="App not connected" description="This application does not have an Account connection."/><Link className="inline-link" to="/apps">Back to connected apps</Link></>;
  const {app,connection}=q.data;
  const granted=new Map(connection.grantedPermissions.map((permission)=>[permission.permissionId,permission.status]));
  const mutationPending=grant.isPending||revoke.isPending;
  return <><PageHeader title={app.name} description={app.description}/>
    {connection.status==="disconnected"?<Notice>This app is disconnected. Existing cloud data, if any, remains separate from the connection.</Notice>:null}
    {connection.status==="limited"?<Notice tone="warning">This app needs an Account access review.</Notice>:null}
    <div className="mt-4 space-y-4">
      <Panel title="Connection" className="ui-panel-accent-peach integration-accent-card"><dl className="detail-grid"><div><dt>Status</dt><dd><StatusBadge tone={connection.status==="connected"?"success":connection.status==="limited"?"warning":"danger"}>{connection.status}</StatusBadge></dd></div>{connection.connectedAt?<div><dt>Connected</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(connection.connectedAt))}</dd></div>:null}{connection.lastUsedAt?<div><dt>Last used</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(connection.lastUsedAt))}</dd></div>:null}<div><dt>App ID</dt><dd className="font-mono text-sm">{app.id}</dd></div></dl></Panel>
      <Panel title="Account access" className="ui-panel-accent-purple" description="Required access is part of the connection. Optional access can be changed independently.">
        <div className="permission-list">{app.availablePermissions.map((permission)=>{const status=granted.get(permission.id)??"denied";const change=async(granted:boolean)=>{const action=()=>granted?grant.mutateAsync({appId:app.id,permissionId:permission.id}):revoke.mutateAsync({appId:app.id,permissionId:permission.id});if(permission.sensitivity==="sensitive")await runSensitive(action);else await action();};return <div className="permission-row" key={permission.id}><div><strong>{permission.name}</strong><small>{permission.description}{permission.sensitivity==="sensitive"?" · Identity confirmation required":""}</small></div><div className="permission-actions">{permission.required?<StatusBadge>Required</StatusBadge>:status==="granted"?<Button variant="ghost" disabled={mutationPending||connection.status==="disconnected"} onClick={()=>void change(false)}>Revoke</Button>:<Button variant="secondary" disabled={mutationPending||connection.status==="disconnected"} onClick={()=>void change(true)}>Allow</Button>}<StatusBadge tone={status==="granted"?"success":"neutral"}>{status}</StatusBadge></div></div>;})}</div>
      </Panel>
      <Panel title="Data & sync" className="ui-panel-accent-blue data-accent-card" description="Detailed live cloud-data state is owned by the P8 Data service."><Link className="inline-link" to={`/data?app=${encodeURIComponent(app.id)}`}>View data status</Link></Panel>
      {connection.status!=="disconnected"?<Panel title="Disconnect" className="ui-panel-accent-pink danger-accent-card"><p className="text-sm text-[var(--muted)]">Disconnecting removes this app's Account access. It does not delete existing cloud data or backups.</p><Button variant="danger" onClick={()=>setDisconnectOpen(true)}>Disconnect {app.name}</Button></Panel>:null}
    </div>
    <ConfirmDialog open={disconnectOpen} title={`Disconnect ${app.name}?`} description="The app will lose THIEPN Account access. Existing cloud data is retained and is not deleted by this action." confirmLabel="Disconnect" danger pending={disconnect.isPending} onCancel={()=>setDisconnectOpen(false)} onConfirm={async()=>{await disconnect.mutateAsync({appId:app.id});setDisconnectOpen(false);navigate("/apps",{replace:true});}}/>
  </>;
}
function syncTone(status:string):"neutral"|"success"|"warning"|"danger"{return status==="up-to-date"?"success":status==="conflict"||status==="error"?"danger":status==="delayed"||status==="pending"||status==="syncing"?"warning":"neutral";}

export function DataPage(){
  const summary=useDataSummary();const list=useAppDataList();
  if(summary.isLoading||list.isLoading)return <Loading/>;
  if(!summary.data)return <div>Could not load cloud data status.</div>;
  const active=(list.data??[]).filter((item)=>item.namespaceStatus==="active");
  const retained=(list.data??[]).filter((item)=>item.namespaceStatus!=="active");
  return <><PageHeader title="Data & Backup" description="Live cloud data, synchronization and recovery status."/>
    {summary.data.attentionCount?<Notice tone="warning">{summary.data.attentionCount} app{summary.data.attentionCount===1?" needs":"s need"} sync attention.</Notice>:null}
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Panel title="Cloud data" className="ui-panel-accent-blue ui-panel-soft-blue" description={`${summary.data.appCount} stored app namespace${summary.data.appCount===1?"":"s"} · ${summary.data.storageApproximate?"approx. ":""}${new Intl.NumberFormat(undefined,{style:"unit",unit:"megabyte",unitDisplay:"short",maximumFractionDigits:1}).format(summary.data.totalStorageBytes/1_000_000)}`}>
        {active.length?<div className="data-list">{active.map((item)=><Link className="data-row" key={item.appId} to={`/data/apps/${item.appId}`}><span><strong>{item.appName}</strong><small>{item.sync.lastSuccessfulSyncAt?`Last successful sync ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.sync.lastSuccessfulSyncAt))}`:"No successful sync yet"}</small></span><StatusBadge tone={syncTone(item.sync.status)}>{item.sync.status}</StatusBadge></Link>)}</div>:<EmptyState title="No cloud data" description="App cloud data will appear here after a connected app stores it."/>}
      </Panel>
      <Panel title="Backup" description={summary.data.backupStatus} className="ui-panel-accent-mint ui-panel-soft-mint"><p className="text-sm text-[var(--muted)]">Backup status is separate from cloud-sync status.</p><Link className="inline-link" to="/data/backups">Manage backups</Link></Panel>
    </div>
    {retained.length?<div className="mt-4"><Panel title="Retained app data" description="Disconnected apps can retain cloud data until you explicitly delete it." className="ui-panel-accent-yellow"><div className="data-list">{retained.map((item)=><Link className="data-row" key={item.appId} to={`/data/apps/${item.appId}`}><span><strong>{item.appName}</strong><small>Cloud data retained</small></span><StatusBadge>retained</StatusBadge></Link>)}</div></Panel></div>:null}
  </>;
}

export function AppDataPage(){
  const {appId}=useParams();const q=useAppData(appId);const retry=useRetrySync();const configure=useUpdateSyncConfiguration();const [disableOpen,setDisableOpen]=useState(false);
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="Cloud data unavailable" description="No cloud-data namespace exists for this app."/><Link className="inline-link" to="/data">Back to Data & Backup</Link></>;
  const item=q.data;
  return <><PageHeader title={item.appName} description="Cloud data and synchronization state."/>
    {item.sync.error?<Notice tone={item.sync.error.kind==="conflict"?"warning":"error"}>{item.sync.error.message}</Notice>:null}
    {item.namespaceStatus==="retained"?<Notice>This app is disconnected or archived. Its existing cloud data remains stored, but synchronization is unavailable.</Notice>:null}
    <div className="mt-4 space-y-4">
      <Panel title="Cloud sync" className="ui-panel-accent-blue data-accent-card"><div className="flex flex-wrap items-center justify-between gap-4"><div><StatusBadge tone={syncTone(item.sync.status)}>{item.sync.status}</StatusBadge>{item.sync.lastSuccessfulSyncAt?<p className="mt-2 text-sm text-[var(--muted)]">Last successful sync: {new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.sync.lastSuccessfulSyncAt))}</p>:null}</div><div className="flex gap-2">{item.sync.error?.retryable?<Button disabled={retry.isPending} onClick={()=>void retry.mutateAsync(item.appId)}>{retry.isPending?"Retrying…":"Retry"}</Button>:null}{item.sync.status==="conflict"?<Link className="inline-link" to={`/apps/${item.appId}`}>Open app access</Link>:null}</div></div></Panel>
      <Panel title="Cloud data" className="ui-panel-accent-mint recovery-accent-card"><dl className="detail-grid"><div><dt>{item.storageApproximate?"Approx. storage":"Storage"}</dt><dd>{new Intl.NumberFormat(undefined,{style:"unit",unit:"megabyte",unitDisplay:"short",maximumFractionDigits:2}).format(item.storageBytes/1_000_000)}</dd></div>{item.recordCount!==undefined?<div><dt>Records</dt><dd>{item.recordCount}</dd></div>:null}<div><dt>Namespace</dt><dd>{item.namespaceStatus}</dd></div></dl></Panel>
      {item.clients.length?<Panel title="Sync clients" className="ui-panel-accent-peach"><div className="device-list">{item.clients.map((client)=><div className="device-row" key={client.id}><div><strong>{client.label}</strong><small>{client.lastSuccessfulSyncAt?new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(client.lastSuccessfulSyncAt)):"Never synced"}</small></div><StatusBadge tone={client.status==="up-to-date"?"success":client.status==="reconciliation-required"?"warning":"neutral"}>{client.status}</StatusBadge></div>)}</div></Panel>:null}
      {item.configuration.supported&&item.configuration.userControllable&&item.namespaceStatus==="active"?<Panel title="Sync settings" className="ui-panel-accent-yellow" description="Disabling sync does not delete existing cloud data.">{item.configuration.enabled?<Button variant="secondary" onClick={()=>setDisableOpen(true)}>Disable cloud sync</Button>:<Button disabled={configure.isPending} onClick={()=>void configure.mutateAsync({appId:item.appId,enabled:true})}>{configure.isPending?"Enabling…":"Enable cloud sync"}</Button>}</Panel>:null}
      <Panel title="Technical details" className="ui-panel-interactive"><dl className="detail-grid"><div><dt>App ID</dt><dd className="font-mono text-sm">{item.appId}</dd></div><div><dt>Stored data state</dt><dd>{item.namespaceStatus}</dd></div></dl></Panel>
    </div>
    <ConfirmDialog open={disableOpen} title={`Disable ${item.appName} cloud sync?`} description="New changes will stop synchronizing. Existing cloud data will remain stored and is not deleted." confirmLabel="Disable sync" pending={configure.isPending} onCancel={()=>setDisableOpen(false)} onConfirm={async()=>{await configure.mutateAsync({appId:item.appId,enabled:false});setDisableOpen(false);}}/>
  </>;
}
export function BackupsPage(){
  const summary=useBackupSummary();const history=useBackups();const create=useCreateBackup();
  if(summary.isLoading||history.isLoading)return <Loading/>;
  return <><PageHeader title="Backups" description="Immutable recovery snapshots of selected app cloud data."/>
    {summary.data?.attention?<Notice tone="warning">{summary.data.attention}</Notice>:null}
    <div className="mt-4 space-y-4">
      <Panel title="Account backup" className="ui-panel-accent-mint recovery-accent-card" description={summary.data?.policy.enabled?`${summary.data.policy.frequency} · ${summary.data.policy.includedApps.length} included app${summary.data.policy.includedApps.length===1?"":"s"}`:"No apps included"}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="m-0 text-sm text-[var(--muted)]">{summary.data?.lastSuccessful?`Last verified backup ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(summary.data.lastSuccessful.createdAt))}`:"No verified backup yet."}</p>{!summary.data?.policy.includedApps.length?<p className="mt-2 text-xs text-[var(--muted)]">Enable “Backup inclusion” in a supported connected app before creating an Account backup.</p>:null}</div><Button disabled={!summary.data?.policy.includedApps.length||create.isPending||Boolean(summary.data?.activeOperation)} onClick={()=>void create.mutateAsync()}>{summary.data?.activeOperation?"Backup running…":create.isPending?"Starting…":"Back up now"}</Button></div></Panel>
      <Panel title="Backup history" className="ui-panel-accent-blue">{history.data?.length?<div className="data-list">{history.data.map((backup)=><Link className="data-row" key={backup.id} to={`/data/backups/${backup.id}`}><span><strong>{backup.type==="pre-restore"?"Recovery snapshot":"Backup"}</strong><small>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(backup.createdAt))} · {backup.apps.length} app{backup.apps.length===1?"":"s"}</small></span><StatusBadge tone={backup.status==="verified"?"success":backup.status==="corrupted"?"danger":"warning"}>{backup.status}</StatusBadge></Link>)}</div>:<EmptyState title="No backups yet" description="Create a manual backup or enable automatic backups."/ >}</Panel>
    </div>
  </>;
}

export function BackupDetailPage(){
  const {backupId}=useParams();const q=useBackup(backupId);
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="Backup unavailable" description="This backup could not be found."/><Link className="inline-link" to="/data/backups">Back to backups</Link></>;
  const backup=q.data;
  return <><PageHeader title={backup.type==="pre-restore"?"Recovery snapshot":"Backup"} description={new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeStyle:"short"}).format(new Date(backup.createdAt))}/>
    <div className="space-y-4">
      <Panel title="Snapshot"><dl className="detail-grid"><div><dt>Status</dt><dd><StatusBadge tone={backup.status==="verified"?"success":"warning"}>{backup.status}</StatusBadge></dd></div><div><dt>Verification</dt><dd>{backup.integrity.status}</dd></div><div><dt>Size</dt><dd>{new Intl.NumberFormat(undefined,{style:"unit",unit:"megabyte",unitDisplay:"short",maximumFractionDigits:2}).format(backup.sizeBytes/1_000_000)}</dd></div><div><dt>Destination</dt><dd>{backup.destination.label}</dd></div><div><dt>Backup ID</dt><dd className="font-mono text-sm">{backup.id}</dd></div></dl></Panel>
      <Panel title="Apps"><div className="data-list">{backup.apps.map((app)=><div className="data-row" key={app.appId}><span><strong>{app.appName}</strong><small>Generation {app.sourceGeneration} · revision {app.sourceRevision}</small></span><StatusBadge tone="success">included</StatusBadge></div>)}</div></Panel>
      {backup.status==="verified"&&backup.type!=="pre-restore"?<Link className="ui-button ui-button-primary no-underline" to={`/data/restore?backup=${encodeURIComponent(backup.id)}`}>Restore from this backup</Link>:null}
    </div>
  </>;
}

export function RestorePage(){
  const [params]=useSearchParams();const backupId=params.get("backup")??undefined;const backup=useBackup(backupId);const planMutation=usePlanRestore();const start=useStartRestore();const navigate=useNavigate();const runSensitive=useSensitiveAction();
  const [selected,setSelected]=useState<string[]>([]);
  useEffect(()=>{if(backup.data&&!selected.length)setSelected(backup.data.apps.map((item)=>item.appId));},[backup.data,selected.length]);
  if(!backupId)return <><PageHeader title="Restore" description="Choose a backup from Backup history before starting a restore."/><Link className="inline-link" to="/data/backups">Choose a backup</Link></>;
  if(backup.isLoading)return <Loading/>;
  if(!backup.data)return <><PageHeader title="Restore" description="The selected backup is unavailable."/><Link className="inline-link" to="/data/backups">Choose another backup</Link></>;
  const plan=planMutation.data;
  return <><PageHeader title="Restore cloud data" description="Restore selected app namespaces from a verified recovery snapshot."/>
    <div className="space-y-4">
      <Notice tone="warning">Restore replaces selected live cloud data. A verified pre-restore safety snapshot is created first, and sync clients must reconcile afterward.</Notice>
      <Panel title="Select apps">{backup.data.apps.map((app)=><label className="check-row" key={app.appId}><input type="checkbox" checked={selected.includes(app.appId)} onChange={(event)=>setSelected((current)=>event.target.checked?[...current,app.appId]:current.filter((id)=>id!==app.appId))}/><span><strong>{app.appName}</strong><small>Backup generation {app.sourceGeneration}, revision {app.sourceRevision}</small></span></label>)}</Panel>
      {!plan?<Button disabled={planMutation.isPending||!selected.length} onClick={()=>void planMutation.mutateAsync({backupId:backup.data!.id,selectedApps:selected})}>{planMutation.isPending?"Preparing…":"Review restore"}</Button>:<Panel title="Restore review">{plan.warnings.map((warning)=><Notice key={warning} tone="warning">{warning}</Notice>)}{plan.blockers.map((blocker)=><Notice key={blocker} tone="error">{blocker}</Notice>)}<p className="text-sm text-[var(--muted)]">A safety snapshot will be created before {plan.selectedApps.length} app namespace{plan.selectedApps.length===1?" is":"s are"} replaced.</p><Button variant="danger" disabled={Boolean(plan.blockers.length)||start.isPending} onClick={async()=>{const operation=await runSensitive(()=>start.mutateAsync(plan.id));if(operation)navigate(`/data/restore/${operation.id}`);}}>{start.isPending?"Starting…":"Confirm restore"}</Button></Panel>}
    </div>
  </>;
}

export function RestoreOperationPage(){
  const {operationId}=useParams();const q=useRestoreOperation(operationId);
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="Restore unavailable" description="This restore operation could not be found."/><Link className="inline-link" to="/data/backups">Back to backups</Link></>;
  const operation=q.data;const terminal=["completed","partially-completed","failed","cancelled"].includes(operation.status);
  return <><PageHeader title={terminal?"Restore result":"Restore in progress"} description="The restore runs in the Account service and survives page navigation."/>
    <Panel title="Restore operation"><div className="restore-status"><StatusBadge tone={operation.status==="completed"?"success":operation.status==="failed"?"danger":"warning"}>{operation.status}</StatusBadge><p>{operation.status==="creating-safety-snapshot"?"Creating recovery snapshot…":operation.status==="restoring"?"Replacing selected cloud namespaces…":operation.status==="verifying"?"Verifying restored state…":operation.status==="completed"?"Restore completed and verified.":"Preparing restore…"}</p></div>{operation.appResults?<div className="data-list">{operation.appResults.map((result)=><div className="data-row" key={result.appId}><span><strong>{result.appId}</strong><small>{result.newGeneration?`New generation ${result.newGeneration}`:"No generation change"}</small></span><StatusBadge tone={result.verified?"success":"danger"}>{result.status}</StatusBadge></div>)}</div>:null}{operation.safetyBackupId?<p className="text-sm text-[var(--muted)]">Safety snapshot: <Link className="inline-link" to={`/data/backups/${operation.safetyBackupId}`}>{operation.safetyBackupId}</Link></p>:null}</Panel>
  </>;
}

export function PrivacyPage(){
  const q=usePrivacySummary();
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <div>Could not load privacy status.</div>;
  return <><PageHeader title="Privacy" description="Export, cloud-data deletion and Account lifecycle controls."/>
    {q.data.accountStatus==="deletion-pending"?<Notice tone="warning">Account deletion is scheduled. Review or cancel it from the deletion status page.</Notice>:null}
    <div className="mt-4 space-y-4">
      <Panel title="Data export" className="ui-panel-accent-blue ui-panel-soft-blue" description={`${q.data.readyExportCount} export${q.data.readyExportCount===1?"":"s"} ready to download`}><Link className="inline-link" to="/privacy/export">Manage exports</Link></Panel>
      <Panel title="Stored app data" className="ui-panel-accent-mint ui-panel-soft-mint" description={`${q.data.storedAppCount} app namespace${q.data.storedAppCount===1?"":"s"} stored`}><p className="text-sm text-[var(--muted)]">Delete individual cloud-data namespaces without disconnecting the app.</p><Link className="inline-link" to="/data">Review stored data</Link></Panel>
      <Panel title="Delete THIEPN Account" className="ui-panel-accent-pink privacy-danger-panel" description="Schedule deletion of the entire Account and its managed data lifecycle."><Link className="ui-button ui-button-danger no-underline" to={q.data.accountStatus==="deletion-pending"?"/account/deletion/status":"/account/deletion"}>{q.data.accountStatus==="deletion-pending"?"View deletion status":"Delete Account"}</Link></Panel>
    </div>
  </>;
}

export function ExportPage(){
  const exports=useExports();const request=useRequestExport();const service=useAccountService();
  const [downloadError,setDownloadError]=useState(false);
  if(exports.isLoading)return <Loading/>;
  async function download(id:string){
    setDownloadError(false);
    try{
      const content=await service.privacy.getExportContent(id);
      const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=`thiepn-account-${id}.json`;
      document.body.appendChild(anchor);
      try{anchor.click();}finally{
        anchor.remove();
        // Browsers can start processing the download after the click returns.
        window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      }
    }catch{setDownloadError(true);}
  }
  return <><PageHeader title="Data export" description="Create a portable copy of your THIEPN Account and supported app metadata."/>
    <div className="space-y-4">
      <Panel title="Request export" className="ui-panel-accent-blue data-accent-card" description="Exports are temporary portable artifacts, not backups."><Button disabled={request.isPending||exports.data?.some((item)=>["queued","collecting","packaging"].includes(item.status))} onClick={()=>void request.mutateAsync(undefined)}>{request.isPending?"Requesting…":"Request Account export"}</Button></Panel>
      {downloadError?<Notice tone="error">The export could not be downloaded. Check your connection and try again; no Account data was deleted.</Notice>:null}
      <Panel title="Export history" className="ui-panel-accent-purple">{exports.data?.length?<div className="data-list">{exports.data.map((item)=><div className="data-row" key={item.id}><span><strong>Account export</strong><small>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.requestedAt))}{item.expiresAt?` · expires ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.expiresAt))}`:""}</small></span>{item.status==="ready"?<Button variant="secondary" onClick={()=>void download(item.id)}>Download</Button>:<StatusBadge tone={item.status==="failed"||item.status==="expired"?"danger":"warning"}>{item.status}</StatusBadge>}</div>)}</div>:<EmptyState title="No exports" description="Requested portable exports will appear here."/ >}</Panel>
    </div>
  </>;
}

export function AppPrivacyPage(){
  const {appId}=useParams();const data=useAppData(appId);const planMutation=usePlanAppDataDeletion();const start=useStartAppDataDeletion();const navigate=useNavigate();const runSensitive=useSensitiveAction();
  const [confirmOpen,setConfirmOpen]=useState(false);
  if(data.isLoading)return <Loading/>;
  if(!data.data)return <><PageHeader title="No cloud data" description="This app currently has no stored cloud-data namespace."/><Link className="inline-link" to="/privacy">Back to Privacy</Link></>;
  const item=data.data;const plan=planMutation.data;
  return <><PageHeader title={`${item.appName} data`} description="Manage this app's cloud-data lifecycle separately from its Account connection."/>
    <div className="space-y-4">
      <Panel title="Stored cloud data"><dl className="detail-grid"><div><dt>Storage</dt><dd>{new Intl.NumberFormat(undefined,{style:"unit",unit:"megabyte",unitDisplay:"short",maximumFractionDigits:2}).format(item.storageBytes/1_000_000)}</dd></div><div><dt>Connection</dt><dd>Deleting cloud data does not disconnect the app.</dd></div></dl></Panel>
      {!plan?<Button variant="danger" disabled={planMutation.isPending} onClick={()=>void planMutation.mutateAsync(item.appId)}>{planMutation.isPending?"Preparing deletion…":"Plan cloud-data deletion"}</Button>:<Panel title="Deletion review">{plan.blockers.map((blocker)=><Notice key={blocker} tone="error">{blocker}</Notice>)}{plan.warnings.map((warning)=><Notice key={warning} tone="warning">{warning}</Notice>)}<p className="text-sm text-[var(--muted)]">{plan.backupImpact}</p><Button variant="danger" disabled={Boolean(plan.blockers.length)} onClick={()=>setConfirmOpen(true)}>Delete {plan.appName} cloud data</Button></Panel>}
    </div>
    <ConfirmDialog open={confirmOpen} title={`Delete ${plan?.appName??item.appName} cloud data?`} description="Live cloud data will be removed. Local data on devices is not erased, the app remains connected, and backup handling follows the stated retention policy." confirmLabel="Delete cloud data" danger pending={start.isPending} onCancel={()=>setConfirmOpen(false)} onConfirm={async()=>{if(!plan)return;const result=await runSensitive(()=>start.mutateAsync(plan.id));if(!result)return;setConfirmOpen(false);navigate("/privacy",{replace:true});}}/>
  </>;
}

export function AccountDeletionPage(){
  const planMutation=usePlanAccountDeletion();const request=useRequestAccountDeletion();const navigate=useNavigate();const runSensitive=useSensitiveAction();const [confirmation,setConfirmation]=useState("");
  const plan=planMutation.data;
  return <><PageHeader title="Delete THIEPN Account" description="Schedule deletion of your Account and managed cloud data."/>
    <div className="space-y-4">
      <Notice tone="warning">Account deletion uses a seven-day grace period. The legacy immediate-delete RPCs are disabled for signed-in clients.</Notice>
      {!plan?<Button variant="danger" disabled={planMutation.isPending} onClick={()=>void planMutation.mutateAsync()}>{planMutation.isPending?"Preparing…":"Review Account deletion"}</Button>:<Panel title="Deletion review"><dl className="detail-grid"><div><dt>Connected apps</dt><dd>{plan.appCount}</dd></div><div><dt>Stored app namespaces</dt><dd>{plan.namespaceCount}</dd></div><div><dt>Backups</dt><dd>{plan.backupCount}</dd></div><div><dt>Grace period</dt><dd>{plan.gracePeriodDays} days</dd></div></dl>{plan.blockers.map((blocker)=><Notice key={blocker} tone="error">{blocker}</Notice>)}{plan.warnings.map((warning)=><Notice key={warning} tone="warning">{warning}</Notice>)}<div className="field mt-4"><label htmlFor="delete-confirmation">Type DELETE to schedule deletion</label><input id="delete-confirmation" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} autoComplete="off"/></div><Button className="mt-4" variant="danger" disabled={confirmation!=="DELETE"||request.isPending||Boolean(plan.blockers.length)} onClick={async()=>{const result=await runSensitive(()=>request.mutateAsync({planId:plan.id,confirmation}));if(result)navigate("/account/deletion/status",{replace:true,state:{id:result.id}});}}>{request.isPending?"Scheduling…":"Schedule Account deletion"}</Button></Panel>}
    </div>
  </>;
}

export function AccountDeletionStatusPage(){
  const q=useAccountDeletion();const cancel=useCancelAccountDeletion();
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="No Account deletion scheduled" description="Your THIEPN Account is active."/><Link className="inline-link" to="/privacy">Back to Privacy</Link></>;
  const item=q.data;return <><PageHeader title="Account deletion status" description="Lifecycle timing is authoritative on the Account service."/><Panel title={item.status==="pending"?"Account deletion scheduled":"Account deletion"}><dl className="detail-grid"><div><dt>Status</dt><dd>{item.status}</dd></div>{item.scheduledDeletionAt?<div><dt>Scheduled deletion</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeStyle:"short"}).format(new Date(item.scheduledDeletionAt))}</dd></div>:null}{item.cancellableUntil?<div><dt>Cancellation available until</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeStyle:"short"}).format(new Date(item.cancellableUntil))}</dd></div>:null}</dl>{item.status==="pending"?<Button className="mt-4" disabled={cancel.isPending} onClick={()=>void cancel.mutateAsync()}>{cancel.isPending?"Cancelling…":"Cancel Account deletion"}</Button>:null}</Panel></>;
}

export function SignInPage(){
  const service=useAccountService();const navigate=useNavigate();const queryClient=useQueryClient();const location=useLocation();const [error,setError]=useState(false);
  const returnTo=(location.state as {returnTo?:string}|null)?.returnTo??"/";
  async function signIn(){setError(false);try{const result=await service.auth.signIn(returnTo);if(!result.redirecting){await queryClient.invalidateQueries({queryKey:["auth"]});navigate(returnTo,{replace:true});}}catch{setError(true);}}
  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-brand"><strong>THIEPN</strong><span>Account</span><div className="page-color-strip" aria-hidden="true"><span/><span/><span/><span/></div></div>
    <h1>Sign in</h1>
    <p>Continue to your THIEPN Account settings.</p>
    {error?<div className="mt-4"><Notice tone="error">Couldn’t start sign-in. Check the Account backend configuration and try again.</Notice></div>:null}
    <button className="primary-button auth-button" onClick={signIn}><span className="auth-google-mark" aria-hidden="true">G</span>Continue with Google</button>
    {import.meta.env.DEV?<p className="mt-4 text-xs text-[var(--muted)]">Development defaults to MockAccountService unless VITE_ACCOUNT_SERVICE_MODE=real.</p>:null}
  </section></main>;
}
export function AuthCallbackPage(){
  const service=useAccountService();const navigate=useNavigate();const queryClient=useQueryClient();const [failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;(async()=>{try{const returnTo=await service.auth.completeCallback();if(!active)return;await queryClient.invalidateQueries({queryKey:["auth"]});navigate(returnTo,{replace:true});}catch{if(active)setFailed(true);}})();return()=>{active=false;};},[service,navigate,queryClient]);
  if(failed)return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><strong>THIEPN</strong><span>Account</span></div><h1>Sign-in couldn’t be completed.</h1><p>The OAuth callback could not establish your Account session.</p><Link className="inline-link mt-4" to="/auth/sign-in">Try again</Link></section></main>;
  return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><strong>THIEPN</strong><span>Account</span></div><h1>Signing you in…</h1><p>Verifying your secure Account session.</p></section></main>;
}

export function AuthErrorPage(){return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><strong>THIEPN</strong><span>Account</span></div><h1>Sign-in error</h1><p>THIEPN Account could not establish your session.</p><Link className="inline-link mt-4" to="/auth/sign-in">Try again</Link></section></main>;}
export function NotFoundPage(){return <><PageHeader title="Page not found" description="This Account page does not exist."/><a className="text-sm font-medium underline" href="/">Return to Overview</a></>;}
