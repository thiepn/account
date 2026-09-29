import { createContext, useContext, type ReactNode } from "react";
import type { AccountService } from "./service";

const AccountServiceContext=createContext<AccountService|null>(null);

export function AccountServiceProvider({service,children}:{service:AccountService;children:ReactNode}){
  return <AccountServiceContext.Provider value={service}>{children}</AccountServiceContext.Provider>;
}
export function useAccountService(){
  const value=useContext(AccountServiceContext);
  if(!value) throw new Error("useAccountService must be used inside AccountServiceProvider");
  return value;
}
