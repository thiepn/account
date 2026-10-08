import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AccountServiceProvider } from "../account/context";
import { createAccountService } from "../account/api/createAccountService";
import { ThemeProvider } from "./theme";
import { mustDiscardProtectedQueries } from "./authCache";

export function AppProviders({children}:{children:ReactNode}){
  const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1,refetchOnWindowFocus:true},mutations:{retry:false}}}));
  const [accountService]=useState(()=>createAccountService());

  useEffect(()=>{
    let previousAccountId:string|null=null;
    return accountService.auth.subscribe((state,accountId)=>{
      if(mustDiscardProtectedQueries(previousAccountId,state,accountId)){
        queryClient.removeQueries({
          predicate:(query)=>query.queryKey[0]!=="auth",
        });
      }
      previousAccountId=state==="signed-in"?(accountId??null):null;
      queryClient.setQueryData(["auth","state"],state);
    });
  },[accountService,queryClient]);

  return <ThemeProvider><QueryClientProvider client={queryClient}><AccountServiceProvider service={accountService}>{children}</AccountServiceProvider></QueryClientProvider></ThemeProvider>;
}
