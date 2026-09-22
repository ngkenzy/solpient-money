export type DirectOfxInstitutionStatus =
  | "candidate"
  | "unsupported"
  | "unknown";

export type DirectOfxInstitutionProfile = {
  id: string;
  name: string;
  status: DirectOfxInstitutionStatus;
  summary: string;
  messageSet?: "banking" | "credit_card" | "investment";
  endpointUrl?: string;
  org?: string;
  fid?: string;
  brokerId?: string;
  appId: string;
  appVer: string;
  notes: string[];
  evidence: {
    label: string;
    url: string;
    kind: "official" | "community";
  }[];
};

export const directOfxInstitutionProfiles: DirectOfxInstitutionProfile[] = [
  {
    id: "vanguard",
    name: "Vanguard",
    status: "candidate",
    summary:
      "Quicken still exposes Vanguard Direct Connect. Community OFX references consistently identify the Vanguard Direct Connect endpoint and investment identifiers, but Vanguard does not publish these as a public third-party developer API.",
    messageSet: "investment",
    endpointUrl:
      "https://vesnc.vanguard.com/us/OfxDirectConnectServlet",
    org: "Vanguard",
    fid: "1358",
    brokerId: "vanguard.com",
    appId: "SOLPIENT",
    appVer: "0100",
    notes: [
      "Use the profile probe first. It sends an anonymous OFX profile request and no account credentials.",
      "ORG has historically appeared as both Vanguard and The Vanguard Group in community configuration references.",
      "Solpient deliberately does not impersonate Quicken by auto-filling a QWIN/QBW application identity.",
      "A reachable server can still reject Solpient because Direct Connect access may depend on institution/vendor enrollment or an approved client identity.",
    ],
    evidence: [
      {
        label: "Quicken community — Vanguard Direct Connect selection",
        url: "https://community.quicken.com/discussion/7961337/vanguard-accounts-keep-reverting-to-simple-tracking-method-solved",
        kind: "community",
      },
      {
        label: "GnuCash OFX Direct Connect settings — Vanguard",
        url: "https://wiki.gnucash.org/wiki/OFX_Direct_Connect_Bank_Settings",
        kind: "community",
      },
    ],
  },
  {
    id: "bank-of-america",
    name: "Bank of America / Merrill",
    status: "unsupported",
    summary:
      "Bank of America/Merrill discontinued OFX services in September 2025, so Solpient should not attempt Direct OFX for this institution.",
    appId: "SOLPIENT",
    appVer: "0100",
    notes: [
      "Use CSV import where available.",
      "For automated access, use an OAuth/aggregator path rather than Direct OFX.",
    ],
    evidence: [
      {
        label: "Quicken — Bank of America OFX discontinued",
        url: "https://community.quicken.com/discussion/7966609/9-30-25-bank-of-america-ofx-discontinued",
        kind: "official",
      },
    ],
  },
  {
    id: "chase",
    name: "Chase",
    status: "unsupported",
    summary:
      "Chase moved Quicken customers away from Direct Connect to Express Web Connect+, so Solpient should not spend time probing legacy Chase Direct OFX.",
    appId: "SOLPIENT",
    appVer: "0100",
    notes: [
      "Use CSV import as the no-aggregator fallback.",
      "For live automation, target OAuth/FDX or an aggregator connector.",
    ],
    evidence: [
      {
        label: "Quicken — Chase Direct Connect migration",
        url: "https://community.quicken.com/discussion/7921812/chase-bank-bill-pay-edited",
        kind: "official",
      },
    ],
  },
];

export function getDirectOfxInstitutionProfile(id: string) {
  return directOfxInstitutionProfiles.find(
    (profile) => profile.id === id
  );
}
