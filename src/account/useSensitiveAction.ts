import { useLocation } from "react-router-dom";
import { useAccountService } from "./context";

function isReauthError(error:unknown){
  return Boolean(error&&typeof error==="object"&&(error as {code?:unknown}).code==="REAUTH_REQUIRED");
}

export function useSensitiveAction(){
  const service=useAccountService();
  const location=useLocation();
  const returnTo=location.pathname+location.search+location.hash;

  return async function runSensitive<T>(action:()=>Promise<T>):Promise<T|undefined>{
    const recent=await service.auth.isRecentlyAuthenticated();
    if(!recent){
      await service.auth.reauthenticate(returnTo);
      return undefined;
    }

    try{
      return await action();
    }catch(error){
      if(isReauthError(error)){
        await service.auth.reauthenticate(returnTo);
        return undefined;
      }
      throw error;
    }
  };
}
