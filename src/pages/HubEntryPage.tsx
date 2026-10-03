import { useEffect, useState } from "react";
import { getHubAuthorizationRequest, HUB_HOME } from "../account/api/hubEntry";
export function HubEntryPage() {
  const [request] = useState(getHubAuthorizationRequest);
  useEffect(() => { window.history.replaceState(null, "", "/hub/entry"); }, []);
  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-brand-mark" aria-hidden="true">T</div><span className="auth-eyebrow">THIEPN Account · Hub</span>
    <h1>{request ? "Sign in to THIEPN Hub" : "This Hub sign-in request is invalid."}</h1>
    <p>{request ? "Choose your Google account to create a Hub session under your THIEPN identity. Your Account browser session remains separate." : "Start again from Hub. Invalid or unsupported requests cannot be continued here."}</p>
    {request ? <a className="primary-button mt-5" href={request} referrerPolicy="no-referrer">Continue with Google</a> : null}
    <a className="inline-link mt-4" href={HUB_HOME} referrerPolicy="no-referrer">Return to Hub</a>
  </section></main>;
}
