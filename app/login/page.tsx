import { Landmark, LockKeyhole } from "lucide-react";
import { isMoneySupabaseConfigured } from "@/lib/supabase/config";
import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const configured = isMoneySupabaseConfigured();

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div>
          <div className="brand-name">SOLPIENT</div>
          <span>MONEY</span>
        </div>
        <h1>Your financial intelligence, private by default.</h1>
        <p>Household financial data lives in a dedicated Money database. Solpient Research remains a separate read-only intelligence source.</p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <span className="auth-icon">{configured ? <LockKeyhole size={21} /> : <Landmark size={21} />}</span>
          <div className="eyebrow">SOLPIENT MONEY V0.5</div>
          <h2>{configured ? "Sign in" : "Database setup required"}</h2>

          {!configured ? (
            <>
              <p className="auth-copy">The app is ready for a dedicated Solpient Money Supabase project, but the required environment variables are not configured yet.</p>
              <div className="auth-setup-code">
                <code>NEXT_PUBLIC_MONEY_SUPABASE_URL</code>
                <code>NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY</code>
              </div>
            </>
          ) : (
            <>
              {params.error ? <div className="auth-message error">{params.error}</div> : null}
              {params.message ? <div className="auth-message success">{params.message}</div> : null}
              <form className="auth-form">
                <input type="hidden" name="next" value={params.next ?? "/"} />
                <label>
                  <span>Email</span>
                  <input name="email" type="email" autoComplete="email" required />
                </label>
                <label>
                  <span>Password</span>
                  <input name="password" type="password" autoComplete="current-password" minLength={8} required />
                </label>
                <button className="primary-auth-button" formAction={login}>Sign in</button>
                <button className="secondary-auth-button" formAction={signup}>Create account</button>
              </form>
            </>
          )}

          <small>No bank credentials belong in Solpient Money source code or GitHub.</small>
        </div>
      </section>
    </main>
  );
}
