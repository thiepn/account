import {HubTmsConnectionsPage} from '../pages/HubTmsConnectionsPage';
import { LanguagesEntryPage } from "../pages/LanguagesEntryPage";
import { HubEntryPage } from "../pages/HubEntryPage";
import { HubConnectionsPage } from "../pages/HubConnectionsPage";
import {ACCOUNT_OAUTH_ENABLED,HUB_SHARING_ENABLED} from './features';
import {OAuthConsentPage} from '../pages/OAuthConsentPage';
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuthState } from "../account/hooks";
import { AccountShell } from "../components/layout/AccountShell";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { AppDataPage, AppDetailPage, AccountDeletionPage, AccountDeletionStatusPage, AppPrivacyPage, AppsPage, BackupDetailPage, BackupsPage, DataPage, ExportPage, NotFoundPage, OverviewPage, PrivacyPage, ProfilePage, RestoreOperationPage, RestorePage, SecurityActivityPage, SecurityEventPage, SecurityPage, SignInPage, AuthCallbackPage, AuthErrorPage } from "../pages/Pages";

function ProtectedAccount(){
  const auth=useAuthState();
  const location=useLocation();
  if(auth.isLoading)return <main className="grid min-h-dvh place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">Checking your account…</main>;
  if(auth.isError)return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4 text-[var(--foreground)]"><div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><h1 className="text-xl font-semibold">THIEPN Account is temporarily unavailable.</h1><p className="mt-2 text-sm text-[var(--muted)]">Your existing sign-in could not be verified. Try again when the Account service is reachable.</p><button className="primary-button mt-5" onClick={()=>void auth.refetch()}>Try again</button></div></main>;
  if(auth.data!=="signed-in")return <Navigate to="/auth/sign-in" replace state={{returnTo:location.pathname+location.search}}/>;
  return <AccountShell/>;
}
export function App(){return <AppErrorBoundary><Routes>
  <Route path="/hub/entry" element={<HubEntryPage/>}/>
  <Route path="/languages/entry" element={<LanguagesEntryPage/>}/>
  <Route path="/auth/sign-in" element={<SignInPage/>}/>
  <Route path="/auth/callback" element={<AuthCallbackPage/>}/>
  <Route path="/auth/error" element={<AuthErrorPage/>}/>
  <Route element={<ProtectedAccount/>}>
    <Route path="/oauth/consent" element={ACCOUNT_OAUTH_ENABLED?<OAuthConsentPage/>:<p>OAuth authorization is not available yet.</p>}/>
    <Route path="/hub/tms60" element={import.meta.env.VITE_HUB_TMS60_ENABLED==='staged-v1'?<HubTmsConnectionsPage/>:<p>TMS60 sharing is not available yet.</p>}/>
    <Route path="/hub/connections" element={HUB_SHARING_ENABLED?<HubConnectionsPage/>:<p>Hub sharing is not available yet.</p>}/>
    <Route path="/" element={<OverviewPage/>}/>
    <Route path="/profile" element={<ProfilePage/>}/>
    <Route path="/security" element={<SecurityPage/>}/>
    <Route path="/security/activity" element={<SecurityActivityPage/>}/>
    <Route path="/security/activity/:eventId" element={<SecurityEventPage/>}/>
    <Route path="/devices" element={<Navigate to="/security#sessions" replace/>}/>
    <Route path="/devices/:deviceId" element={<Navigate to="/security#sessions" replace/>}/>
    <Route path="/apps" element={<AppsPage/>}/>
    <Route path="/apps/:appId" element={<AppDetailPage/>}/>
    <Route path="/data" element={<DataPage/>}/>
    <Route path="/data/apps/:appId" element={<AppDataPage/>}/>
    <Route path="/data/backups" element={<BackupsPage/>}/>
    <Route path="/data/backups/:backupId" element={<BackupDetailPage/>}/>
    <Route path="/data/restore" element={<RestorePage/>}/>
    <Route path="/data/restore/:operationId" element={<RestoreOperationPage/>}/>
    <Route path="/privacy" element={<PrivacyPage/>}/>
    <Route path="/privacy/export" element={<ExportPage/>}/>
    <Route path="/privacy/apps/:appId" element={<AppPrivacyPage/>}/>
    <Route path="/account/deletion" element={<AccountDeletionPage/>}/>
    <Route path="/account/deletion/status" element={<AccountDeletionStatusPage/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Route>
</Routes></AppErrorBoundary>;}
