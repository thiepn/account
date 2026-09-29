import { z } from "zod";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useApps, useDataSummary, useDevice, useDevices, useOverview, usePrivacySummary, useProfile, useRevokeDevice, useRevokeOtherSessions, useRevokeSession, useSecurity, useSecurityActivity, useSecurityEvent, useUpdateProfile } from "../account/hooks";
import { useAccountService } from "../account/context";
import { useTheme } from "../app/theme";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/ui/StatusBadge";

function PageHeader({title,description}:{title:string;description:string}){return <header className="mb-7"><h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em]">{title}</h1><p className="mt-2 max-w-2xl text-[15px] leading-6 text-[var(--muted)]">{description}</p></header>;}
function Loading(){return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">Loading…</div>;}
function Notice({children,tone="info"}:{children:React.ReactNode;tone?:"info"|"error"|"success"}){return <div className={`notice notice-${tone}`} role={tone==="error"?"alert":"status"}>{children}</div>;}

export function OverviewPage(){const q=useOverview();if(q.isLoading)return <Loading/>;if(!q.data)return <div>Could not load the account overview.</div>;const {identity,security,devices,apps,data}=q.data;return <>
  <PageHeader title="Overview" description="Your THIEPN Account, access and data at a glance."/>
  {identity.status==="deletion-pending"?<div className="mb-5 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm">Account deletion is pending in this mock scenario. Real lifecycle integration is not enabled yet.</div>:null}
  {security.attention.length?<div className="mb-5 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm">{security.attention[0]}</div>:null}
  <div className="grid gap-4 lg:grid-cols-2">
    <Panel title={identity.displayName} description={identity.primaryEmail}><dl className="detail-grid"><div><dt>Provider</dt><dd>Google</dd></div><div><dt>Status</dt><dd>{identity.status}</dd></div></dl></Panel>
    <Panel title="Security" description={security.attention.length?"Needs attention":"No security issues need your attention."}><p className="text-sm text-[var(--muted)]">Sign-in method: {security.authMethod}</p></Panel>
    <Panel title="Devices" description={`${devices.length} signed-in device${devices.length===1?"":"s"}`}><p className="text-sm text-[var(--muted)]">{devices.find((d)=>d.current)?.label??"Current device unavailable"}</p></Panel>
    <Panel title="Apps" description={`${apps.length} connected app${apps.length===1?"":"s"}`}><p className="text-sm text-[var(--muted)]">{apps.slice(0,3).map((a)=>a.name).join(", ")||"No connected apps yet."}</p></Panel>
    <Panel title="Data & Backup" description={data.syncStatus==="healthy"?"No known sync issues.":"Sync needs attention."}><p className="text-sm text-[var(--muted)]">Backup: {data.backupStatus}</p></Panel>
  </div></>;}

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
      <Panel title="Profile information" description="This name is shown across THIEPN apps that use your basic account identity.">
        <div className="profile-row">
          <div className="profile-avatar" aria-hidden="true">{profile.data.displayName.trim().charAt(0).toUpperCase()||"?"}</div>
          <div className="field grow">
            <label htmlFor="display-name">Display name</label>
            <input id="display-name" autoComplete="name" maxLength={80} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName?"display-name-error":undefined} {...register("displayName")}/>
            {errors.displayName?<p id="display-name-error" className="field-error">{errors.displayName.message}</p>:<p className="field-help">1–80 characters.</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Account identity" description="Authentication identity is managed separately from your editable profile.">
        <dl className="detail-grid">
          <div><dt>Primary email</dt><dd>{identity.primaryEmail} {identity.emailVerified?"· Verified":""}</dd></div>
          <div><dt>Sign-in provider</dt><dd>Google</dd></div>
          <div><dt>Account ID</dt><dd className="font-mono text-sm">{identity.accountId}</dd></div>
          <div><dt>Created</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"long"}).format(new Date(identity.createdAt))}</dd></div>
        </dl>
      </Panel>

      <Panel title="Preferences" description="Account-level display preferences.">
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
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <div>Could not load security status.</div>;
  return <><PageHeader title="Security" description="Sign-in methods, protection and recent account activity."/><div className="space-y-4">
    {q.data.attention.length?<Notice tone="warning">{q.data.attention[0]}</Notice>:null}
    <Panel title="Sign-in method"><div className="flex items-center justify-between gap-4"><p className="text-sm">{q.data.authMethod}</p><StatusBadge tone="success">Connected</StatusBadge></div></Panel>
    <Panel title="Additional protection"><div className="flex items-center justify-between gap-4"><div><p className="m-0 text-sm font-medium">Two-step verification</p><p className="mt-1 text-sm text-[var(--muted)]">Additional protection is capability-gated until the real auth backend supports it.</p></div><StatusBadge>{q.data.twoStepVerification}</StatusBadge></div></Panel>
    <Panel title="Recent security activity" description="Important sign-ins and Account security changes."><div className="activity-list">{q.data.recentActivity.map((event)=><Link className="activity-row" key={event.id} to={`/security/activity/${event.id}`}><span><strong>{event.title}</strong><small>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.occurredAt))}</small></span><StatusBadge tone={event.severity==="warning"?"warning":event.severity==="critical"?"danger":"neutral"}>{event.category}</StatusBadge></Link>)}</div><Link className="inline-link" to="/security/activity">View all activity</Link></Panel>
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
  return <><PageHeader title={event.title} description={event.description}/><Panel title="Event details"><dl className="detail-grid"><div><dt>Category</dt><dd>{event.category}</dd></div><div><dt>Time</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeStyle:"medium"}).format(new Date(event.occurredAt))}</dd></div>{event.deviceId?<div><dt>Device</dt><dd><Link className="inline-link" to={`/devices/${event.deviceId}`}>{event.deviceId}</Link></dd></div>:null}<div><dt>Event ID</dt><dd className="font-mono text-sm">{event.id}</dd></div></dl></Panel></>;
}

export function DevicesPage(){
  const q=useDevices();
  const revokeDevice=useRevokeDevice();
  const revokeOthers=useRevokeOtherSessions();
  const [target,setTarget]=useState<{id:string;label:string}|null>(null);
  const devices=q.data??[];
  const others=devices.filter((device)=>!device.current);
  if(q.isLoading)return <Loading/>;
  return <><PageHeader title="Devices" description="Recognized client environments with active THIEPN Account sessions."/>
    <div className="space-y-4">
      {devices.filter((device)=>device.current).map((device)=><Panel key={device.id} title={device.label} description="Current device"><div className="flex items-center justify-between gap-4"><p className="text-sm text-[var(--muted)]">{device.sessions.length} active session{device.sessions.length===1?"":"s"}</p><Link className="inline-link" to={`/devices/${device.id}`}>View</Link></div></Panel>)}
      <Panel title="Other signed-in devices" description={others.length?"Remote access you can review and revoke.":"No other devices are signed in."}>
        {others.length?<div className="device-list">{others.map((device)=><div className="device-row" key={device.id}><Link to={`/devices/${device.id}`}><strong>{device.label}</strong><small>{device.platform} · {device.sessions.length} session{device.sessions.length===1?"":"s"}</small></Link><Button variant="ghost" onClick={()=>setTarget({id:device.id,label:device.label})}>Sign out</Button></div>)}</div>:<EmptyState title="Only this device" description="No other active Account sessions are associated with another device."/>}
      </Panel>
      {others.length?<Button onClick={()=>void revokeOthers.mutateAsync()} disabled={revokeOthers.isPending}>{revokeOthers.isPending?"Signing out…":"Sign out all other sessions"}</Button>:null}
    </div>
    <ConfirmDialog open={Boolean(target)} title={`Sign out ${target?.label??"device"}?`} description="All active Account sessions associated with this device will need to sign in again. Existing app data is not erased." confirmLabel="Sign out" danger pending={revokeDevice.isPending} onCancel={()=>setTarget(null)} onConfirm={async()=>{if(!target)return;await revokeDevice.mutateAsync(target.id);setTarget(null);}}/>
  </>;
}

export function DeviceDetailPage(){
  const {deviceId}=useParams();
  const q=useDevice(deviceId);
  const revokeSession=useRevokeSession();
  const [target,setTarget]=useState<{id:string;name:string}|null>(null);
  if(q.isLoading)return <Loading/>;
  if(!q.data)return <><PageHeader title="Device no longer signed in" description="This device has no active Account sessions."/><Link className="inline-link" to="/devices">Back to devices</Link></>;
  const device=q.data;
  return <><PageHeader title={device.label} description={device.current?"Current device":device.platform}/><div className="space-y-4">
    <Panel title="Device"><dl className="detail-grid"><div><dt>Platform</dt><dd>{device.platform}</dd></div><div><dt>First seen</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(device.firstSeenAt))}</dd></div><div><dt>Last activity</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(device.lastActivityAt))}</dd></div><div><dt>Device ID</dt><dd className="font-mono text-sm">{device.id}</dd></div></dl></Panel>
    <Panel title="Active sessions"><div className="device-list">{device.sessions.map((session)=><div className="device-row" key={session.id}><div><strong>{session.clientName}</strong><small>{session.current?"Current session":`Last active ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(session.lastActivityAt))}`}</small></div>{session.current?<StatusBadge tone="success">Current</StatusBadge>:<Button variant="ghost" onClick={()=>setTarget({id:session.id,name:session.clientName})}>Sign out</Button>}</div>)}</div></Panel>
  </div><ConfirmDialog open={Boolean(target)} title={`Sign out ${target?.name??"session"}?`} description="This session will need to sign in again. Other sessions are unaffected." confirmLabel="Sign out" danger pending={revokeSession.isPending} onCancel={()=>setTarget(null)} onConfirm={async()=>{if(!target)return;await revokeSession.mutateAsync(target.id);setTarget(null);}}/></>;
}
export function AppsPage(){const q=useApps();if(q.isLoading)return <Loading/>;return <><PageHeader title="Apps" description="Applications currently connected to your THIEPN Account."/><div className="space-y-3">{q.data?.length?q.data.map((app)=><Panel key={app.id} title={app.name} description={app.status}><p className="text-sm text-[var(--muted)]">Account access and permission management will be connected through the real registry in P15.</p></Panel>):<Panel title="No connected apps"><p className="text-sm text-[var(--muted)]">Apps you connect will appear here.</p></Panel>}</div></>;}
export function DataPage(){const q=useDataSummary();if(q.isLoading)return <Loading/>;if(!q.data)return <div>Could not load cloud data status.</div>;return <><PageHeader title="Data & Backup" description="Live cloud data, synchronization and recovery status."/><div className="grid gap-4 lg:grid-cols-2"><Panel title="Cloud data" description={q.data.syncStatus}><p className="text-sm text-[var(--muted)]">{q.data.appCount} app namespaces in this mock state.</p></Panel><Panel title="Backup" description={q.data.backupStatus}><p className="text-sm text-[var(--muted)]">Real backup integration is intentionally deferred until the live-data contract is proven.</p></Panel></div></>;}
export function PrivacyPage(){const q=usePrivacySummary();if(q.isLoading)return <Loading/>;return <><PageHeader title="Privacy" description="Export, deletion and Account lifecycle controls."/><Panel title="Lifecycle controls"><dl className="detail-grid"><div><dt>Export</dt><dd>{q.data?.exportAvailable?"Available in mock contract":"Unavailable"}</dd></div><div><dt>App-data deletion</dt><dd>{q.data?.appDeletionAvailable?"Available":"Not connected yet"}</dd></div><div><dt>Account deletion</dt><dd>{q.data?.accountDeletionAvailable?"Available":"Not connected yet"}</dd></div></dl></Panel></>;}

export function SignInPage(){const service=useAccountService();const navigate=useNavigate();const queryClient=useQueryClient();async function signIn(){await service.auth.signIn();await queryClient.invalidateQueries({queryKey:["auth"]});navigate("/",{replace:true});}return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4"><div className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-sm"><h1 className="text-2xl font-semibold">THIEPN Account</h1><p className="mt-2 text-sm text-[var(--muted)]">Sign in to manage your account.</p><button className="primary-button mt-6 w-full" onClick={signIn}>Continue with Google</button><p className="mt-4 text-xs text-[var(--muted)]">Development currently uses MockAccountService. Production will never fall back to mock authentication.</p></div></main>;}
export function NotFoundPage(){return <><PageHeader title="Page not found" description="This Account page does not exist."/><a className="text-sm font-medium underline" href="/">Return to Overview</a></>;}
