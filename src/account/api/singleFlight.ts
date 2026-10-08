/** Join concurrent OAuth operations by authorization ID.
 * One-use authorization codes must not be issued twice under React effects,
 * token-refresh events or duplicate browser requests. */
export function createSingleFlight<K,V>(){
  const inflight=new Map<K,Promise<V>>();
  return (key:K,action:()=>Promise<V>):Promise<V>=>{
    const existing=inflight.get(key);
    if(existing)return existing;
    const promise=Promise.resolve().then(action);
    inflight.set(key,promise);
    const release=()=>{if(inflight.get(key)===promise)inflight.delete(key);};
    void promise.then(release,release);
    return promise;
  };
}
