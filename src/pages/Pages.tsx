import { z } from "zod";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useApps, useDataSummary, useDevices, useOverview, usePrivacySummary, useProfile, useSecurity, useUpdateProfile } from "../account/hooks";
import { useAccountService } from "../account/context";
import { useTheme } from "../app/theme";
import { Panel } from "../components/ui/Panel";

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

export function SecurityPage(){const q=useSecurity();if(q.isLoading)return <Loading/>;if(!q.data)return <div>Could not load security status.</div>;return <><PageHeader title="Security" description="Sign-in methods, protection and recent account activity."/><div className="space-y-4"><Panel title="Sign-in method"><p className="text-sm">{q.data.authMethod}</p></Panel><Panel title="Two-step verification"><p className="text-sm text-[var(--muted)]">{q.data.twoStepVerification}</p></Panel><Panel title="Recent activity"><ul className="space-y-2 text-sm text-[var(--muted)]">{q.data.recentActivity.map((item)=><li key={item}>{item}</li>)}</ul></Panel></div></>;}
export function DevicesPage(){const q=useDevices();if(q.isLoading)return <Loading/>;return <><PageHeader title="Devices" description="Where your Account is currently signed in."/><div className="space-y-3">{q.data?.map((device)=><Panel key={device.id} title={device.label} description={device.current?"Current device":device.platform}><p className="text-sm text-[var(--muted)]">{device.sessions} active session{device.sessions===1?"":"s"}</p></Panel>)}</div></>;}
export function AppsPage(){const q=useApps();if(q.isLoading)return <Loading/>;return <><PageHeader title="Apps" description="Applications currently connected to your THIEPN Account."/><div className="space-y-3">{q.data?.length?q.data.map((app)=><Panel key={app.id} title={app.name} description={app.status}><p className="text-sm text-[var(--muted)]">Account access and permission management will be connected through the real registry in P15.</p></Panel>):<Panel title="No connected apps"><p className="text-sm text-[var(--muted)]">Apps you connect will appear here.</p></Panel>}</div></>;}
export function DataPage(){const q=useDataSummary();if(q.isLoading)return <Loading/>;if(!q.data)return <div>Could not load cloud data status.</div>;return <><PageHeader title="Data & Backup" description="Live cloud data, synchronization and recovery status."/><div className="grid gap-4 lg:grid-cols-2"><Panel title="Cloud data" description={q.data.syncStatus}><p className="text-sm text-[var(--muted)]">{q.data.appCount} app namespaces in this mock state.</p></Panel><Panel title="Backup" description={q.data.backupStatus}><p className="text-sm text-[var(--muted)]">Real backup integration is intentionally deferred until the live-data contract is proven.</p></Panel></div></>;}
export function PrivacyPage(){const q=usePrivacySummary();if(q.isLoading)return <Loading/>;return <><PageHeader title="Privacy" description="Export, deletion and Account lifecycle controls."/><Panel title="Lifecycle controls"><dl className="detail-grid"><div><dt>Export</dt><dd>{q.data?.exportAvailable?"Available in mock contract":"Unavailable"}</dd></div><div><dt>App-data deletion</dt><dd>{q.data?.appDeletionAvailable?"Available":"Not connected yet"}</dd></div><div><dt>Account deletion</dt><dd>{q.data?.accountDeletionAvailable?"Available":"Not connected yet"}</dd></div></dl></Panel></>;}

export function SignInPage(){const service=useAccountService();const navigate=useNavigate();const queryClient=useQueryClient();async function signIn(){await service.auth.signIn();await queryClient.invalidateQueries({queryKey:["auth"]});navigate("/",{replace:true});}return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4"><div className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-sm"><h1 className="text-2xl font-semibold">THIEPN Account</h1><p className="mt-2 text-sm text-[var(--muted)]">Sign in to manage your account.</p><button className="primary-button mt-6 w-full" onClick={signIn}>Continue with Google</button><p className="mt-4 text-xs text-[var(--muted)]">Development currently uses MockAccountService. Production will never fall back to mock authentication.</p></div></main>;}
export function NotFoundPage(){return <><PageHeader title="Page not found" description="This Account page does not exist."/><a className="text-sm font-medium underline" href="/">Return to Overview</a></>;}
