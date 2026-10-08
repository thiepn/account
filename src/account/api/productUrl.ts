/** Only first-party HTTPS destinations may be offered as Account app launch links.
 * Unknown or malformed registry URLs are omitted rather than opened. */
export function safeThiepnProductUrl(value:unknown):string|null{
  if(typeof value!=="string"||value.length>2048)return null;
  try{
    const url=new URL(value);
    const firstParty=url.hostname==="thiepn.dev"||url.hostname.endsWith(".thiepn.dev");
    if(
      !firstParty||url.protocol!=="https:"||url.port||
      url.username||url.password||url.search||url.hash
    )return null;
    return url.href;
  }catch{return null;}
}
