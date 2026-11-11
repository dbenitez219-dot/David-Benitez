import Link from "next/link";
import type { Filters } from "@/lib/filters";
import { getT } from "@/lib/locale";

type Opt = { id: string; name: string };
const sel = "input !py-2 !text-sm";

export async function FilterBar({ action, f, options, extra }: {
  action: string; f: Filters;
  options: { accounts: Opt[]; campaigns: Opt[]; adsets: Opt[]; ads: Opt[] };
  extra?: React.ReactNode;
}) {
  const t = await getT();
  const presets = ["7", "14", "30", "60", "90"];
  const Select = ({ name, label, opts, value }: { name: string; label: string; opts: Opt[]; value?: string }) => (
    <label className="block text-xs text-muted">{label}
      <select name={name} defaultValue={value ?? ""} className={sel}>
        <option value="">{t("filter.all")}</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
  return (
    <form action={action} method="get" className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {presets.map((p) => (
          <Link key={p} href={`${action}?range=${p}`} className={`rounded-full border px-3 py-1 ${f.rangeKey === p ? "border-zred bg-zred/15" : "border-line text-muted hover:text-white"}`}>{t("filter.days", { n: p })}</Link>
        ))}
        <span className="ml-auto text-xs text-muted">{f.from.toISOString().slice(0, 10)} → {f.to.toISOString().slice(0, 10)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <label className="block text-xs text-muted">{t("filter.from")}<input type="date" name="from" defaultValue={f.from.toISOString().slice(0, 10)} className={sel} /></label>
        <label className="block text-xs text-muted">{t("filter.to")}<input type="date" name="to" defaultValue={f.to.toISOString().slice(0, 10)} className={sel} /></label>
        <Select name="account" label={t("filter.account")} opts={options.accounts} value={f.account} />
        <Select name="campaign" label={t("filter.campaign")} opts={options.campaigns} value={f.campaign} />
        <Select name="adset" label={t("filter.adset")} opts={options.adsets} value={f.adset} />
        <Select name="ad" label={t("filter.ad")} opts={options.ads} value={f.ad} />
        {extra}
      </div>
      <div className="flex gap-2">
        <button className="btn !py-2 text-sm">{t("filter.apply")}</button>
        <Link href={action} className="btn btn-ghost !py-2 text-sm">{t("filter.clear")}</Link>
      </div>
    </form>
  );
}
