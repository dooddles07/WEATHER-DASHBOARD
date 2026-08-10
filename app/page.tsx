export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <p className="label-micro">Foundation check</p>
      <h1 className="readout readout-lg mt-3 text-4xl">28°</h1>
      <p className="mt-2 text-secondary">
        Archivo at expanded width, the graphite ramp, and the hairline panel.
      </p>
      <p className="measured mt-6 text-xs text-tertiary">14.5995° N 120.9842° E</p>
      <div className="panel mt-6 p-4">
        <span className="text-sm">Panel surface</span>
      </div>
    </main>
  );
}
