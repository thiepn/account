import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthState } from "../account/hooks";
import { AccountShell } from "../components/layout/AccountShell";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { AppsPage, DataPage, DevicesPage, NotFoundPage, OverviewPage, PrivacyPage, ProfilePage, SecurityPage, SignInPage } from "../pages/Pages";

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
    <Route path="/devices" element={<DevicesPage/>}/>
    <Route path="/apps" element={<AppsPage/>}/>
    <Route path="/data" element={<DataPage/>}/>
    <Route path="/privacy" element={<PrivacyPage/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Route>
</Routes></AppErrorBoundary>;}
