export default function App() {
  return (
    <main className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          WIM — Warranty & Inventory Manager
        </h1>
        <p className="text-gray-600">
          Frontend baseline ready (React + Vite + Tailwind).
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow">
          <h2 className="font-semibold">Inventaire</h2>
          <p className="text-sm text-gray-600">Liste et détail des articles.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow">
          <h2 className="font-semibold">Garanties</h2>
          <p className="text-sm text-gray-600">Dates d’achat, fin, statut.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow">
          <h2 className="font-semibold">Alertes</h2>
          <p className="text-sm text-gray-600">Rappels J-30 / J-7 / J-1.</p>
        </div>
      </section>
    </main>
  );
}
