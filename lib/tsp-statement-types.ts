export const TSP_STATEMENT_PARSER_VERSION = "1.8.0" as const;

export type TspStatementSourceKind = "csv" | "structured_text";

export type TspStatementFundCode =
  | "G"
  | "F"
  | "C"
  | "S"
  | "I"
  | string;

export type TspStatementFundBalance = {
  fundCode: TspStatementFundCode;
  fundName: string | null;
  balanceCents: number;
};

export type TspStatementCandidate = {
  statementDate: string | null;
  traditionalBalanceCents: number | null;
  rothBalanceCents: number | null;
  totalBalanceCents: number | null;
  funds: TspStatementFundBalance[];
  employeeContribYtdCents: number | null;
  serviceAutoYtdCents: number | null;
  serviceMatchYtdCents: number | null;
  outstandingLoanCents: number | null;
};

export type TspStatementIssue = {
  code: string;
  field: string | null;
  message: string;
};

export type TspStatementReconciliation = {
  traditionalRothVsTotalCents: number | null;
  traditionalRothVsTotalOk: boolean | null;
  fundsVsTotalCents: number | null;
  fundsVsTotalOk: boolean | null;
};

export type TspStatementParseResult = {
  parserVersion: typeof TSP_STATEMENT_PARSER_VERSION;
  sourceKind: TspStatementSourceKind;
  confirmed: false;
  ok: boolean;
  candidate: TspStatementCandidate;
  warnings: TspStatementIssue[];
  errors: TspStatementIssue[];
  reconciliation: TspStatementReconciliation;
  unknownFields: string[];
};
