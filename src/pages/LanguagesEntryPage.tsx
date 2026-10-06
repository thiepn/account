import { useEffect, useState } from "react";
import {
  getLanguagesAuthorizationRequest,
  LANGUAGES_HOME,
} from "../account/api/languagesEntry";

export function LanguagesEntryPage() {
  const [request] = useState(getLanguagesAuthorizationRequest);

  useEffect(() => {
    window.history.replaceState(null, "", "/languages/entry");
  }, []);

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand-mark" aria-hidden="true">T</div>
        <span className="auth-eyebrow">THIEPN Account · Languages</span>
        <h1>
          {request
            ? "Sign in to THIEPN Languages"
            : "This Languages sign-in request is invalid."}
        </h1>
        <p>
          {request
            ? "Choose your Google account to create a Languages session under your THIEPN identity. Your Account browser session remains separate."
            : "Start again from Languages. Invalid or unsupported requests cannot be continued here."}
        </p>
        {request ? (
          <a
            className="primary-button mt-5"
            href={request}
            referrerPolicy="no-referrer"
          >
            Continue with Google
          </a>
        ) : null}
        <a
          className="inline-link mt-4"
          href={LANGUAGES_HOME}
          referrerPolicy="no-referrer"
        >
          Return to Languages
        </a>
      </section>
    </main>
  );
}
