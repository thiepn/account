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
export function useDataSummary(){const s=useAccountService();return useQuery({queryKey:["data","summary"],queryFn:()=>s.data.getSummary()});}
export function usePrivacySummary(){const s=useAccountService();return useQuery({queryKey:["privacy","summary"],queryFn:()=>s.privacy.getSummary()});}
export function useUpdateProfile(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:(input:UpdateProfileInput)=>s.profile.updateProfile(input),onSuccess:(profile)=>{q.setQueryData(["profile"],profile);void q.invalidateQueries({queryKey:["overview"]});}});}
function useRevocation(mutationFn:(id:string)=>Promise<void>){
  const q=useQueryClient();
  return useMutation({mutationFn,onSuccess:()=>{void q.invalidateQueries({queryKey:["devices"]});void q.invalidateQueries({queryKey:["security"]});void q.invalidateQueries({queryKey:["overview"]});}});
}
export function useRevokeSession(){const s=useAccountService();return useRevocation((id)=>s.devices.revokeSession(id));}
export function useRevokeDevice(){const s=useAccountService();return useRevocation((id)=>s.devices.revokeDevice(id));}
export function useRevokeOtherSessions(){const s=useAccountService();const q=useQueryClient();return useMutation({mutationFn:()=>s.devices.revokeOtherSessions(),onSuccess:()=>{void q.invalidateQueries({queryKey:["devices"]});void q.invalidateQueries({queryKey:["security"]});void q.invalidateQueries({queryKey:["overview"]});}});}
