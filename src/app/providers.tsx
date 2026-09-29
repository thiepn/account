import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AccountServiceProvider } from "../account/context";
import { createAccountService } from "../account/api/createAccountService";
import { ThemeProvider } from "./theme";

export function AppProviders({children}:{children:ReactNode}){
  const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1,refetchOnWindowFocus:true},mutations:{retry:false}}}));
  const [accountService]=useState(()=>createAccountService());

  useEffect(()=>accountService.auth.subscribe((state)=>{
    if(state==="signed-out")queryClient.clear();
    else void queryClient.invalidateQueries({queryKey:["auth"]});
  }),[accountService,queryClient]);

  return <ThemeProvider><QueryClientProvider client={queryClient}><AccountServiceProvider service={accountService}>{children}</AccountServiceProvider></QueryClientProvider></ThemeProvider>;
}
