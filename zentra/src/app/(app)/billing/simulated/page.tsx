import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getFormatter } from "@/lib/locale";
import { simulatedAllowed } from "@/server/billing/providers/simulated";
import { requireOrg } from "@/server/tenancy/context";
import { simulatedResultAction } from "../actions";

export const metadata = { title: "Pago simulado — ZENTRA" };

export default async function Simulated({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ctx = await requireOrg("ADMIN");
  const { money } = await getFormatter();
  if (!simulatedAllowed()) notFound();
  const { ref } = await searchParams;
  const pay = ref ? await db.payment.findFirst({ where: { organizationId: ctx.organizationId, provider: "simulated", providerRef: ref, status: "PENDING" } }) : null;
  if (!pay) notFound();
  return (
    <div className="animate-rise max-w-md space-y-5">
      <p role="alert" className="rounded-xl border-2 border-violet-500 bg-violet-500/10 p-4 text-sm"><strong>PÁGINA DE PAGO SIMULADA.</strong> Esto NO es un banco ni una pasarela real: no se cobra nada y no hay que ingresar datos de tarjeta.</p>
      <div className="card space-y-3 p-5">
        <p className="text-sm text-muted">Plan {pay.planId}{pay.consentRecurring ? " · con cobro automático autorizado" : ""}</p>
        <p className="text-2xl font-bold">{money(pay.amountMinor, pay.currency)}</p>
        <form action={simulatedResultAction} className="flex gap-2">
          <input type="hidden" name="ref" value={pay.providerRef ?? ""} />
          <button name="result" value="ok" className="btn flex-1">Simular pago aprobado</button>
          <button name="result" value="fail" className="btn btn-ghost flex-1">Simular rechazo</button>
        </form>
      </div>
    </div>
  );
}
