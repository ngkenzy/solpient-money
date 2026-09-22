import Link from "next/link";
import {
  HardDrive,
  LockKeyhole,
} from "lucide-react";
import { isLocalDatabaseConfigured } from "@/lib/local-db/config";

export default async function LoginPage() {
  const configured =
    isLocalDatabaseConfigured();

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div>
          <div className="brand-name">
            SOLPIENT
          </div>
          <span>MONEY LOCAL</span>
        </div>
        <h1>
          Your financial intelligence stays on
          your Mac.
        </h1>
        <p>
          Solpient Money now uses a local
          PostgreSQL database in Docker. There
          is no cloud database login and no
          hosted Money backend.
        </p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <span className="auth-icon">
            {configured ? (
              <LockKeyhole size={21} />
            ) : (
              <HardDrive size={21} />
            )}
          </span>
          <div className="eyebrow">
            SOLPIENT LOCAL V1
          </div>
          <h2>
            {configured
              ? "Local database ready"
              : "Local setup required"}
          </h2>

          {configured ? (
            <>
              <p className="auth-copy">
                This installation is single-user
                and local-only. PostgreSQL is
                bound to 127.0.0.1 and the
                browser never connects directly
                to the database.
              </p>
              <Link
                className="primary-auth-button"
                href="/"
              >
                Open Solpient Money
              </Link>
            </>
          ) : (
            <>
              <p className="auth-copy">
                Start Docker, then initialize
                the free local PostgreSQL stack.
              </p>
              <div className="auth-setup-code">
                <code>npm run local:setup</code>
                <code>npm run dev</code>
              </div>
            </>
          )}

          <small>
            Bank passwords are never stored in
            Solpient Money.
          </small>
        </div>
      </section>
    </main>
  );
}
