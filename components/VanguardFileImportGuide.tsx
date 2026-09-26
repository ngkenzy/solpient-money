"use client";

import {
  ArrowDown,
  BadgeCheck,
  FileSpreadsheet,
  MousePointerClick,
  RefreshCw,
} from "lucide-react";

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Download from Vanguard",
    body: "Log in at vanguard.com, open your account, and use the Download or Export option to save your data as a CSV. The file that includes both your current holdings and your transaction history works best — if Vanguard offers them separately, download both and drop them together.",
  },
  {
    icon: FileSpreadsheet,
    title: "Drop the file in the import center below",
    body: "Solpient recognizes Vanguard files automatically — holdings and activity are sorted to the right account with no column mapping. If you grabbed the wrong file, it will tell you.",
  },
  {
    icon: BadgeCheck,
    title: "Review and confirm",
    body: "Check the preview, confirm the import, and your Portfolio, Transactions, and Overview update. Between downloads, the Refresh prices button on the Portfolio page keeps market values current.",
  },
];

export default function VanguardFileImportGuide() {
  return (
    <section className="card page-card vanguard-guided">
      <div className="section-title-row">
        <div>
          <span className="card-kicker">
            VANGUARD IMPORT · RECOMMENDED · ABOUT 2 MINUTES
          </span>
          <h2>Keep Vanguard fresh with file downloads</h2>
        </div>
        <span className="connector-sdk-icon">
          <FileSpreadsheet size={18} />
        </span>
      </div>

      <p className="vanguard-guided-lede">
        Vanguard doesn&apos;t offer a reliable direct connection for apps
        like Solpient, so the dependable path is Vanguard&apos;s own
        download. Do it whenever you want fresh numbers — the Connect page
        flags any account that hasn&apos;t had a file refresh in 14 days.
      </p>

      <ol className="vanguard-file-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="vanguard-file-step">
            <span className="vanguard-guided-step-num">
              {index + 1}
            </span>
            <div>
              <strong>
                <step.icon size={14} /> {step.title}
              </strong>
              <span>{step.body}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="vanguard-guided-note">
        <RefreshCw size={17} />
        <div>
          <strong>Repeat whenever you like.</strong>
          <span>
            Imports are deduplicated, so re-downloading the same period is
            safe — only new holdings and activity are added. One download
            per Vanguard account keeps each one current.
          </span>
        </div>
      </div>

      <div className="connect-actions">
        <a className="research-button" href="#import-center">
          Go to the import center <ArrowDown size={14} />
        </a>
      </div>
    </section>
  );
}
