import type { AuthState } from "../account/types";

/** A browser session may switch Google identities without a sign-out event.
 * Never reuse Account-domain cached data across that boundary. */
export function mustDiscardProtectedQueries(
  previousAccountId:string|null,
  nextAuthState:AuthState,
  nextAccountId?:string,
):boolean{
  if(nextAuthState!=="signed-in")return true;
  return previousAccountId!==null&&(!nextAccountId||previousAccountId!==nextAccountId);
}
