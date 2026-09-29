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
export function saveReturnTo(value:unknown){sessionStorage.setItem(STORAGE_KEY,validateReturnTo(value));}
export function consumeReturnTo(){const value=validateReturnTo(sessionStorage.getItem(STORAGE_KEY));sessionStorage.removeItem(STORAGE_KEY);return value;}
