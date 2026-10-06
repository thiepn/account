import { useEffect, useState } from "react";
import {
  getJapaneseAuthorizationRequest,
  JAPANESE_HOME,
} from "../account/api/japaneseEntry";

export function JapaneseEntryPage() {
  const [request] = useState(getJapaneseAuthorizationRequest);

  useEffect(() => {
    window.history.replaceState(null, "", "/japanese/entry");
  }, []);

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand-mark" aria-hidden="true">T</div>
        <span className="auth-eyebrow">THIEPN Account · Japanese</span>
        <h1>
          {request
            ? "Sign in to Japanese with THIEPN Account"
            : "This Japanese sign-in request is invalid."}
        </h1>
        <p>
          {request
            ? "Choose your Google account to create a Japanese session under your existing THIEPN identity. Japanese does not create a separate account."
            : "Start again from Japanese. Invalid or unsupported requests cannot be continued here."}
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
          href={JAPANESE_HOME}
          referrerPolicy="no-referrer"
        >
          Return to Japanese
        </a>
      </section>
    </main>
  );
}
