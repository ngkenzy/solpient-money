import { redirect } from "next/navigation";

// Debt payoff now lives inside the Financial Plan waterfall (/plan#debt-payoff).
// This route is kept so old links and bookmarks keep working.
export default function DebtPage() {
  redirect("/plan#debt-payoff");
}
