import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountService } from "./context";
import type { UpdateProfileInput } from "./service";

export function useAuthState(){const s=useAccountService();return useQuery({queryKey:["auth","state"],queryFn:()=>s.auth.getState()});}
export function useOverview(){const s=useAccountService();return useQuery({queryKey:["overview"],queryFn:()=>s.getOverview()});}
export function useProfile(){const s=useAccountService();return useQuery({queryKey:["profile"],queryFn:()=>s.profile.getProfile()});}
export function useSecurity(){const s=useAccountService();return useQuery({queryKey:["security"],queryFn:()=>s.security.getSummary()});}
export function useSecurityActivity(){const s=useAccountService();return useQuery({queryKey:["security","activity"],queryFn:()=>s.security.listActivity()});}
export function useSecurityEvent(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["security","activity",id],queryFn:()=>s.security.getEvent(id!),enabled:Boolean(id)});}
export function useDevices(){const s=useAccountService();return useQuery({queryKey:["devices"],queryFn:()=>s.devices.listDevices()});}
export function useDevice(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["devices",id],queryFn:()=>s.devices.getDevice(id!),enabled:Boolean(id)});}
export function useApps(){const s=useAccountService();return useQuery({queryKey:["apps"],queryFn:()=>s.apps.listApps()});}
export function useApp(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["apps",id],queryFn:()=>s.apps.getApp(id!),enabled:Boolean(id)});}
export function useDataSummary(){const s=useAccountService();return useQuery({queryKey:["data","summary"],queryFn:()=>s.data.getSummary()});}
export function useAppDataList(){const s=useAccountService();return useQuery({queryKey:["data","apps"],queryFn:()=>s.data.listAppData()});}
export function useAppData(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["data","apps",id],queryFn:()=>s.data.getAppData(id!),enabled:Boolean(id)});}
export function useRetrySync(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:(appId:string)=>s.data.retrySync(appId),onSuccess:(_detail,appId)=>{void q.invalidateQueries({queryKey:["data"]});void q.invalidateQueries({queryKey:["data","apps",appId]});void q.invalidateQueries({queryKey:["overview"]});}});}
export function useUpdateSyncConfiguration(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:({appId,enabled}:{appId:string;enabled:boolean})=>s.data.updateSyncConfiguration(appId,enabled),onSuccess:(_detail,input)=>{void q.invalidateQueries({queryKey:["data"]});void q.invalidateQueries({queryKey:["data","apps",input.appId]});void q.invalidateQueries({queryKey:["overview"]});}});}
export function useBackupSummary(){const s=useAccountService();return useQuery({queryKey:["backup","summary"],queryFn:()=>s.backup.getSummary(),refetchInterval:(query)=>query.state.data?.activeOperation?800:false});}
export function useBackups(){const s=useAccountService();return useQuery({queryKey:["backup","history"],queryFn:()=>s.backup.listBackups()});}
export function useBackup(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["backup",id],queryFn:()=>s.backup.getBackup(id!),enabled:Boolean(id)});}
export function useCreateBackup(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:()=>s.backup.createBackup(),onSuccess:()=>{void q.invalidateQueries({queryKey:["backup"]});void q.invalidateQueries({queryKey:["overview"]});}});}
export function usePlanRestore(){const s=useAccountService();return useMutation({mutationFn:({backupId,selectedApps}:{backupId:string;selectedApps:string[]})=>s.backup.planRestore(backupId,selectedApps)});}
export function useStartRestore(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:(planId:string)=>s.backup.startRestore(planId),onSuccess:()=>{void q.invalidateQueries({queryKey:["backup"]});void q.invalidateQueries({queryKey:["data"]});}});}
export function useRestoreOperation(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["restore",id],queryFn:()=>s.backup.getRestoreOperation(id!),enabled:Boolean(id),refetchInterval:(query)=>query.state.data&&!["completed","partially-completed","failed","cancelled"].includes(query.state.data.status)?800:false});}
export function useCapabilities(){const s=useAccountService();return useQuery({queryKey:["capabilities"],queryFn:()=>s.capabilities.getCapabilities(),staleTime:5*60_000});}
export function usePrivacySummary(){const s=useAccountService();return useQuery({queryKey:["privacy","summary"],queryFn:()=>s.privacy.getSummary()});}
export function useExports(){const s=useAccountService();return useQuery({queryKey:["privacy","exports"],queryFn:()=>s.privacy.listExports(),refetchInterval:(query)=>query.state.data?.some((item)=>["queued","collecting","packaging"].includes(item.status))?800:false});}
export function useRequestExport(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:(appIds?:string[])=>s.privacy.requestExport(appIds),onSuccess:()=>{void q.invalidateQueries({queryKey:["privacy"]});}});}
export function useExport(id:string|undefined){const s=useAccountService();return useQuery({queryKey:["privacy","exports",id],queryFn:()=>s.privacy.getExport(id!),enabled:Boolean(id),refetchInterval:(query)=>query.state.data&&!["ready","expired","failed"].includes(query.state.data.status)?800:false});}
export function usePlanAppDataDeletion(){const s=useAccountService();return useMutation({mutationFn:(appId:string)=>s.privacy.planAppDataDeletion(appId)});}
export function useStartAppDataDeletion(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:(planId:string)=>s.privacy.startAppDataDeletion(planId),onSuccess:()=>{void q.invalidateQueries({queryKey:["privacy"]});void q.invalidateQueries({queryKey:["data"]});void q.invalidateQueries({queryKey:["overview"]});}});}
export function usePlanAccountDeletion(){const s=useAccountService();return useMutation({mutationFn:()=>s.privacy.planAccountDeletion()});}
export function useRequestAccountDeletion(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:({planId,confirmation}:{planId:string;confirmation:string})=>s.privacy.requestAccountDeletion(planId,confirmation),onSuccess:()=>{void q.invalidateQueries({queryKey:["privacy"]});void q.invalidateQueries({queryKey:["overview"]});}});}
export function useAccountDeletion(){const s=useAccountService();return useQuery({queryKey:["privacy","account-deletion"],queryFn:()=>s.privacy.getAccountDeletion()});}
export function useCancelAccountDeletion(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:()=>s.privacy.cancelAccountDeletion(),onSuccess:()=>{void q.invalidateQueries({queryKey:["privacy"]});void q.invalidateQueries({queryKey:["overview"]});}});}

export function useUpdateProfile(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:(input:UpdateProfileInput)=>s.profile.updateProfile(input),onSuccess:(profile)=>{q.setQueryData(["profile"],profile);void q.invalidateQueries({queryKey:["overview"]});}});}
function useRevocation(mutationFn:(id:string)=>Promise<void>){const q=useQueryClient();return useMutation({mutationFn,onSuccess:()=>{void q.invalidateQueries({queryKey:["devices"]});void q.invalidateQueries({queryKey:["security"]});void q.invalidateQueries({queryKey:["overview"]});}});}
export function useRevokeSession(){const s=useAccountService();return useRevocation((id)=>s.devices.revokeSession(id));}
export function useRevokeDevice(){const s=useAccountService();return useRevocation((id)=>s.devices.revokeDevice(id));}
export function useRevokeOtherSessions(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:()=>s.devices.revokeOtherSessions(),onSuccess:()=>{void q.invalidateQueries({queryKey:["devices"]});void q.invalidateQueries({queryKey:["security"]});void q.invalidateQueries({queryKey:["overview"]});}});}

function useAppMutation<T extends {appId:string}>(mutationFn:(input:T)=>Promise<unknown>){
  const q=useQueryClient();
  return useMutation({mutationFn,onSuccess:(_result,input)=>{void q.invalidateQueries({queryKey:["apps"]});void q.invalidateQueries({queryKey:["apps",input.appId]});void q.invalidateQueries({queryKey:["security"]});void q.invalidateQueries({queryKey:["overview"]});}});
}
export function useGrantPermission(){const s=useAccountService();return useAppMutation(({appId,permissionId}:{appId:string;permissionId:string})=>s.apps.grantPermission(appId,permissionId));}
export function useRevokePermission(){const s=useAccountService();return useAppMutation(({appId,permissionId}:{appId:string;permissionId:string})=>s.apps.revokePermission(appId,permissionId));}
export function useDisconnectApp(){const s=useAccountService();return useAppMutation(({appId}:{appId:string})=>s.apps.disconnect(appId));}
