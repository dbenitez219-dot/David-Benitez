import { z } from "zod";

const id = z.string().regex(/^[a-z0-9]{10,40}$/).optional().catch(undefined);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);

const schema = z.object({
  range: z.enum(["7", "14", "30", "60", "90"]).optional().catch(undefined),
  from: day, to: day, account: id, campaign: id, adset: id, ad: id,
});

export type Filters = {
  from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number;
  rangeKey: string; account?: string; campaign?: string; adset?: string; ad?: string;
};

export const utcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const DAY = 86_400_000;

export function parseFilters(sp: Record<string, string | string[] | undefined>, now = new Date()): Filters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const f = schema.parse(flat);
  let to = utcDay(now), from: Date, rangeKey: string = f.range ?? "30";
  if (f.from && f.to && !Number.isNaN(Date.parse(f.from)) && !Number.isNaN(Date.parse(f.to))) {
    from = new Date(f.from + "T00:00:00Z"); to = new Date(f.to + "T00:00:00Z");
    if (from > to) [from, to] = [to, from];
    if ((to.getTime() - from.getTime()) / DAY > 366) from = new Date(to.getTime() - 366 * DAY);
    rangeKey = "custom";
  } else {
    from = new Date(to.getTime() - (Number(rangeKey) - 1) * DAY);
  }
  const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
  const prevTo = new Date(from.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY);
  return { from, to, prevFrom, prevTo, days, rangeKey, account: f.account, campaign: f.campaign, adset: f.adset, ad: f.ad };
}
