const STORAGE_KEY="thiepn.account.returnTo";
export function validateReturnTo(value:unknown):string{
  if(typeof value!=="string"||value.length===0||value.length>2048)return "/";
  if(!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return "/";
  try{
    const url=new URL(value,"https://account.thiepn.dev");
    if(url.origin!=="https://account.thiepn.dev")return "/";
    if(url.pathname.startsWith("/auth/"))return "/";
    return url.pathname+url.search+url.hash;
  }catch{return "/";}
}
export function saveReturnTo(value:unknown,storage?:Storage):boolean{
  try{
    (storage??globalThis.sessionStorage).setItem(STORAGE_KEY,validateReturnTo(value));
    return true;
  }catch{
    // A blocked browser storage area must never turn a safe navigation
    // target into an authentication failure. Callback falls back to "/".
    return false;
  }
}
export function consumeReturnTo(storage?:Storage):string{
  try{
    const area=storage??globalThis.sessionStorage;
    const value=validateReturnTo(area.getItem(STORAGE_KEY));
    area.removeItem(STORAGE_KEY);
    return value;
  }catch{return "/";}
}
