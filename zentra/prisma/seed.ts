// Planes iniciales (precios de Paraguay). Configurables luego desde el panel administrador (Fase 6).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const PLANS = [
  { id: "START", name: "Start", maxAdAccounts: 1, price: 99_999 },
  { id: "BUSINESS", name: "Business", maxAdAccounts: 3, price: 199_999 },
  { id: "AGENCY", name: "Agency", maxAdAccounts: 10, price: 399_999 },
];

async function main() {
  for (const p of PLANS) {
    await db.plan.upsert({ where: { id: p.id }, update: { name: p.name, maxAdAccounts: p.maxAdAccounts }, create: { id: p.id, name: p.name, maxAdAccounts: p.maxAdAccounts, features: {} } });
    await db.planPrice.upsert({
      where: { planId_countryCode_currency: { planId: p.id, countryCode: "PY", currency: "PYG" } },
      update: {},
      create: { planId: p.id, countryCode: "PY", currency: "PYG", amountMinor: p.price },
    });
  }
}
main().finally(() => db.$disconnect());
