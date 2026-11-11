import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { setPriceAction } from "../actions";

export default async function Plans() {
  const prices = await db.planPrice.findMany({ orderBy: [{ countryCode: "asc" }, { amountMinor: "asc" }] });
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Cada país tiene sus propios precios y monedas: <strong>no se convierten automáticamente</strong>. Sin precio para un país, ese plan no se puede pagar allí. Los cambios afectan a nuevas suscripciones; quien ya es cliente conserva su precio.</p>
      <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted"><tr><th className="p-3 font-normal">País</th><th className="font-normal">Plan</th><th className="font-normal">Precio</th><th className="font-normal">Unidad mínima</th><th className="font-normal">Impuesto</th><th className="font-normal">Activo</th></tr></thead>
        <tbody>{prices.map((p) => (
          <tr key={p.id} className="border-t border-line"><td className="p-3">{p.countryCode}</td><td>{p.planId}</td><td className="tabular-nums">{money(p.amountMinor, p.currency)}</td><td className="tabular-nums text-muted">{p.amountMinor} {p.currency}</td>
            <td>{p.taxPercent === null ? "sin definir" : `${Number(p.taxPercent)}% ${p.taxIncluded ? "incluido" : "adicional"}`}</td><td>{p.active ? "Sí" : "No"}</td></tr>))}</tbody></table></div>
      <section className="card p-5"><h2 className="mb-3 font-semibold">Crear o editar un precio</h2>
        <p className="mb-3 text-xs text-muted">Si ya existe el mismo plan + país + moneda, se actualiza. El importe va en la unidad mínima de la moneda (PYG no tiene decimales; USD en centavos).</p>
        <ActionForm action={setPriceAction} submit="Guardar precio" className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">Plan<select className="input" name="planId"><option>START</option><option>BUSINESS</option><option>AGENCY</option></select></label>
          <label className="block text-sm">País (2 letras)<input className="input" name="countryCode" maxLength={2} required placeholder="PY" /></label>
          <label className="block text-sm">Moneda (3 letras)<input className="input" name="currency" maxLength={3} required placeholder="PYG" /></label>
          <label className="block text-sm">Importe (unidad mínima)<input className="input" name="amountMinor" type="number" step="1" min="1" required /></label>
          <label className="block text-sm">Impuesto % (opcional)<input className="input" name="taxPercent" type="number" step="any" min="0" max="100" /></label>
          <div className="space-y-2 pt-6 text-sm"><label className="flex gap-2"><input type="checkbox" name="taxIncluded" defaultChecked className="accent-[#e5202e]" />Impuesto incluido en el precio</label>
            <label className="flex gap-2"><input type="checkbox" name="active" defaultChecked className="accent-[#e5202e]" />Activo</label></div>
        </ActionForm></section>
    </div>
  );
}
