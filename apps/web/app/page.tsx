export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <header className="space-y-4">
          <p className="text-sm font-semibold tracking-[0.2em] text-cyan-300 uppercase">
            Read-only foundation
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Commerce Operations Investigator
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            Diagnose why a paid order has not reached shipment creation without
            changing commerce state.
          </p>
        </header>

        <section className="grid gap-5 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-medium">API foundation</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The Express service exposes a health endpoint. Investigation and
              MCP behavior arrive only in their reviewed phases.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-medium">Trace viewer</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This shell stays non-functional until the read-only trace phase.
              It has no database access and performs no operational actions.
            </p>
          </article>
        </section>

        <aside className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100">
          Safety boundary: commerce records are read-only. Human-review
          recommendations never claim an operational fix was executed.
        </aside>
      </div>
    </main>
  );
}
