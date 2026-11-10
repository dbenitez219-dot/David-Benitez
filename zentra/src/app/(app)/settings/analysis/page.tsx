import { hasRole, requireOrg } from "@/server/tenancy/context";
import { getAnalysisConfig } from "@/server/analytics/settings";
import { AnalysisForm } from "@/components/AnalysisForm";
import { saveAnalysisAction } from "./actions";

export const metadata = { title: "Criterios de análisis — ZENTRA" };

export default async function AnalysisSettingsPage() {
  const ctx = await requireOrg();
  const c = await getAnalysisConfig(ctx.organizationId);
  return (
    <div className="animate-rise max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Criterios de análisis</h1>
        <p className="text-sm text-muted">Cada negocio es distinto: define cuándo un anuncio tiene datos suficientes y cuánto estás dispuesto a pagar por resultado.</p>
      </div>
      <AnalysisForm action={saveAnalysisAction} currency={ctx.organization.currency} canEdit={hasRole(ctx.role, "ADMIN")}
        v={{ minSpend: c.minSpend, minDays: c.minDays, minImpressions: c.minImpressions, targetCprMessages: c.targets?.MESSAGES, targetCprLeads: c.targets?.LEADS, targetCprSales: c.targets?.SALES, maxFrequency: c.maxFrequency, anomalyFactor: c.anomalyFactor }} />
    </div>
  );
}
