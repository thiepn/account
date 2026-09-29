import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthState } from "../account/hooks";
import { AccountShell } from "../components/layout/AccountShell";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { AppDataPage, AppDetailPage, AccountDeletionPage, AccountDeletionStatusPage, AppPrivacyPage, AppsPage, BackupDetailPage, BackupsPage, DataPage, ExportPage, DeviceDetailPage, DevicesPage, NotFoundPage, OverviewPage, PrivacyPage, ProfilePage, RestoreOperationPage, RestorePage, SecurityActivityPage, SecurityEventPage, SecurityPage, SignInPage } from "../pages/Pages";

function ProtectedAccount(){
  const auth=useAuthState();
  if(auth.isLoading)return <main className="grid min-h-dvh place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">Checking your account…</main>;
  if(auth.data!=="signed-in")return <Navigate to="/auth/sign-in" replace/>;
  return <AccountShell/>;
}
export function App(){return <AppErrorBoundary><Routes>
  <Route path="/auth/sign-in" element={<SignInPage/>}/>
  <Route element={<ProtectedAccount/>}>
    <Route path="/" element={<OverviewPage/>}/>
    <Route path="/profile" element={<ProfilePage/>}/>
    <Route path="/security" element={<SecurityPage/>}/>
    <Route path="/security/activity" element={<SecurityActivityPage/>}/>
    <Route path="/security/activity/:eventId" element={<SecurityEventPage/>}/>
    <Route path="/devices" element={<DevicesPage/>}/>
    <Route path="/devices/:deviceId" element={<DeviceDetailPage/>}/>
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
