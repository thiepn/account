import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountService } from "./context";
import type { UpdateProfileInput } from "./service";

export function useAuthState(){const s=useAccountService();return useQuery({queryKey:["auth","state"],queryFn:()=>s.auth.getState()});}
export function useOverview(){const s=useAccountService();return useQuery({queryKey:["overview"],queryFn:()=>s.getOverview()});}
export function useProfile(){const s=useAccountService();return useQuery({queryKey:["profile"],queryFn:()=>s.profile.getProfile()});}
export function useSecurity(){const s=useAccountService();return useQuery({queryKey:["security"],queryFn:()=>s.security.getSummary()});}
export function useDevices(){const s=useAccountService();return useQuery({queryKey:["devices"],queryFn:()=>s.devices.listDevices()});}
export function useApps(){const s=useAccountService();return useQuery({queryKey:["apps"],queryFn:()=>s.apps.listApps()});}
export function useDataSummary(){const s=useAccountService();return useQuery({queryKey:["data","summary"],queryFn:()=>s.data.getSummary()});}
export function usePrivacySummary(){const s=useAccountService();return useQuery({queryKey:["privacy","summary"],queryFn:()=>s.privacy.getSummary()});}

export function useUpdateProfile(){
  const s=useAccountService();
  const queryClient=useQueryClient();
  return useMutation({
    mutationFn:(input:UpdateProfileInput)=>s.profile.updateProfile(input),
    onSuccess:(profile)=>{
      queryClient.setQueryData(["profile"],profile);
      void queryClient.invalidateQueries({queryKey:["overview"]});
    },
  });
}
