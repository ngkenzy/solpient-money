import PageHeader from "@/components/PageHeader";
import MoneyCopilot from "@/components/MoneyCopilot";

export const dynamic = "force-dynamic";

export default function CopilotPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="V1.0 · LOCAL MONEY COPILOT"
        title="Ask Solpient about your finances."
        description="Common questions are answered directly from deterministic Solpient calculations. Broader explanations can use an optional local Ollama model. The Copilot is read-only and cannot move money or modify your financial data."
      />
      <MoneyCopilot />
    </div>
  );
}
