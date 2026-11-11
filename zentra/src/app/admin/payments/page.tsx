import { db } from "@/lib/db";
import { dateLong, money } from "@/lib/format";

export default async function Payments() {
  const pays = await db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { organization: { select: { name: true } } } });
  return (
    <div className="card overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
      <thead className="text-xs text-muted"><tr><th className="p-3 font-normal">Fecha</th><th className="font-normal">Empresa</th><th className="font-normal">Concepto</th><th className="font-normal">Importe</th><th className="font-normal">Proveedor</th><th className="font-normal">Estado</th></tr></thead>
      <tbody>{pays.map((p) => (
        <tr key={p.id} className="border-t border-line"><td className="p-3 whitespace-nowrap">{dateLong(p.createdAt)}</td><td>{p.organization.name}</td><td>{p.kind} · {p.planId}</td><td className="tabular-nums">{money(p.amountMinor, p.currency)}</td>
          <td>{p.provider}{p.isSimulated && <span className="ml-1 rounded border border-violet-500/50 px-1.5 text-xs text-violet-300">SIMULADO</span>}</td><td>{p.status}{p.failureReason && <span className="block text-xs text-muted">{p.failureReason}</span>}</td></tr>))}
        {pays.length === 0 && <tr><td className="p-4 text-muted" colSpan={6}>Sin pagos.</td></tr>}</tbody></table></div>
  );
}
