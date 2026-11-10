import { db } from "@/lib/db";

export const metadata = { title: "Eliminación de datos — ZENTRA" };

export default async function DataDeletion({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const req = code && /^[a-f0-9]{24}$/.test(code) ? await db.dataDeletionRequest.findUnique({ where: { code } }) : null;
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-3 text-2xl font-bold">Eliminación de datos</h1>
      {req ? (
        <p className="text-muted">Tu solicitud <code>{req.code}</code> se completó el {req.createdAt.toISOString().slice(0, 10)}. Eliminamos las cuentas publicitarias de Meta vinculadas y toda la información sincronizada.</p>
      ) : (
        <p className="text-muted">Para eliminar tus datos, retira ZENTRA desde Configuración → Integraciones de empresa en Meta, o desconecta la cuenta desde «Conexiones». Si ya enviaste una solicitud, usa el enlace con tu código de confirmación.</p>
      )}
    </main>
  );
}
