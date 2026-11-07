"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gallery, Stars } from "./RankPhotos";
import { defaults, type Config, type Photo, type Row, type Session } from "./lib/core";
import { pairing, forgetPairing, networkPermission, localFetch, localJSON } from "./lib/lightroom";
import styles from "./rank.module.css";
type LocalConfig = Config & { references?: boolean };
type LocalRow = Omit<Row, "strength"> & { name: string; rating: number; override: number | null };
type Report = { run_id: string; config: LocalConfig & { bands: string | [number, number][] }; stage: number; rows: LocalRow[]; total: number; spent: number; held: number; done: number; pending: number; uncertain: number; complete: boolean; bands: Record<string, number>; metrics: { total: number; compared: number; components: number }; references: number };
type State = { connected: boolean; busy: boolean; caption: string; error: string; revision: number; catalog_name: string; has_run: boolean; active: string | null; report: Omit<Report, "rows"> | null };
function toConfig(report: Report): LocalConfig { return { ...report.config, bands: Array.isArray(report.config.bands) ? report.config.bands.map(([stars, percent]) => `${stars}:${percent}`).join(",") : report.config.bands }; }
function LocalPreview({ token, photo, large = false }: { token: string; photo: Photo; large?: boolean }) {
  const [url, setUrl] = useState(""), [error, setError] = useState(false);
  useEffect(() => {
    let active = true, source = ""; setUrl(""); setError(false);
    localFetch(token, "/preview/" + encodeURIComponent(photo.id) + (large ? "?size=large" : "")).then(r => r.blob()).then(blob => {
      if (active) { source = URL.createObjectURL(blob); setUrl(source); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (source) URL.revokeObjectURL(source); };
  }, [token, photo.id, large]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={photo.name} draggable={false} /> : <span className={styles.loading}>{error ? "Preview unavailable · refresh Lightroom selection" : "Loading Lightroom preview…"}</span>;
}
export default function LightroomRank() {
  const [token, setToken] = useState(""), [connected, setConnected] = useState(false), [state, setState] = useState<State | null>(null), [report, setReport] = useState<Report | null>(null);
  const [config, setConfig] = useState<LocalConfig>({ ...defaults, references: false }), [settings, setSettings] = useState(true), [pending, setPending] = useState(false), [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [selected, setSelected] = useState<string | null>(null);
  const revision = useRef(-1), runId = useRef(""), mounted = useRef(true), polling = useRef(false);
  useEffect(() => { mounted.current = true; setToken(pairing()); return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const next = await localJSON<State>(token, "/status"); if (!mounted.current) return;
      setState(next);
      if (!next.connected) throw new Error("Lightroom is no longer connected. Reopen Rank & Rate from Lightroom on this Mac.");
      if (next.has_run && next.revision !== revision.current) {
        const value = await localJSON<{ report: Report }>(token, "/report"); if (!mounted.current) return;
        setReport(value.report); revision.current = next.revision;
        if (value.report.run_id !== runId.current) { runId.current = value.report.run_id; setConfig(toConfig(value.report)); setSelected(null); setSearch(""); setFilter("all"); }
      }
      setConnected(true);
    } finally { polling.current = false; }
  }, [token]);
  async function connect() {
    setNotice(""); setPending(true);
    try { if (await networkPermission() === "denied") throw new Error("Local access is blocked. Allow local / loopback network access for brooksl.com in your browser’s site settings, then connect again."); await refresh(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not connect to Lightroom."); setConnected(false); }
    finally { setPending(false); }
  }
  useEffect(() => {
    if (!token) return;
    let active = true;
    networkPermission().then(permission => { if (active && permission === "granted") refresh().catch(e => setNotice(e.message)); });
    return () => { active = false; };
  }, [token, refresh]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => { refresh().catch(e => { setNotice(e.message); setConnected(false); }); }, 2000);
    return () => clearInterval(timer);
  }, [connected, refresh]);
  const busy = pending || !!state?.busy;
  async function command(operation: string, params: Record<string, unknown> = {}, stop = false) {
    if (!connected || (busy && !stop)) return;
    setPending(true); setNotice("");
    const id = crypto.randomUUID();
    try {
      // This command is submitted once. A lost reply is never an automatic replay.
      await localJSON(token, "/commands", { id, operation, params });
      if (operation === "disconnect") { forgetPairing(); setToken(""); setConnected(false); setState(null); setReport(null); return; }
      if (stop) { setNotice("Stopping after requests already in flight finish. Completed results stay saved."); return; }
      while (mounted.current) {
        await new Promise(resolve => setTimeout(resolve, 700));
        const result = await localJSON<{ state: string; error?: string }>(token, "/commands/" + id);
        if (result.state === "failed") throw new Error(result.error || "The Lightroom operation stopped.");
        if (result.state === "done") break;
      }
      await refresh();
      if (operation === "configure") { const value = await localJSON<{ report: Report }>(token, "/report"); if (mounted.current) setConfig(toConfig(value.report)); }
    } catch (e) { if (mounted.current) setNotice((e instanceof Error ? e.message : "Connection interrupted.") + " The command was not retried. Check Lightroom before trying again."); }
    finally { if (mounted.current) setPending(false); }
  }
  const gallerySession = useMemo<Session | null>(() => report ? {
    id: report.run_id, name: "Lightroom selection", created: 0, config: toConfig(report), round: report.stage, jobs: [], ready: true, importErrors: [],
    photos: report.rows.map(r => ({ id: r.id, name: r.name, digest: r.id, size: 0, modified: 0, width: 0, height: 0, visual: [], ...(r.override == null ? {} : { override: r.override }) })),
  } : null, [report]);
  const photos = useMemo(() => new Map(gallerySession?.photos.map(p => [p.id, p]) ?? []), [gallerySession]);
  const rows = useMemo<Row[]>(() => (report?.rows ?? []).filter(r => r.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || filter === "boundary" && r.boundary || filter === "manual" && r.override != null || String(r.proposed) === filter)).map(r => ({ ...r, strength: 0 })), [report, search, filter]);
  const index = rows.findIndex(r => r.id === selected), row = rows[index], photo = selected ? photos.get(selected) : undefined;
  const override = (id: string, value?: number) => void command("overrides", { values: { [id]: value ?? -1 } });
  useEffect(() => {
    if (!selected) return;
    const before = document.activeElement as HTMLElement | null, dialog = document.getElementById("lightroom-viewer"); dialog?.focus();
    function keydown(e: KeyboardEvent) {
      if (e.key === "Escape") { setSelected(null); return; }
      if ((e.target as HTMLElement).matches("select,input,textarea")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setSelected(rows[(index + (e.key === "ArrowRight" ? 1 : -1) + rows.length) % rows.length]?.id ?? null); }
      if (/^[0-5]$/.test(e.key) && !busy) override(selected!, Number(e.key));
      if (e.key === "Tab" && dialog) {
        const nodes = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled),select:not(:disabled)")];
        if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === dialog)) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
      }
    }
    window.addEventListener("keydown", keydown); return () => { window.removeEventListener("keydown", keydown); before?.focus(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, index, rows, busy]);
  function exportCSV() {
    if (!report) return;
    const cell = (value: unknown) => { const text = String(value ?? ""); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"'; };
    const csv = [["filename", "rank", "relative_score", "proposed_stars", "current_snapshot_stars", "comparisons", "reason"], ...report.rows.map(r => [r.name, r.score == null ? null : r.place, r.score, r.proposed, r.rating, r.coverage, r.reason])].map(line => line.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a"); a.href = url; a.download = "lightroom-rank-and-rate.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const summary = state?.report ?? report;
  const changed = report && JSON.stringify(config) !== JSON.stringify(toConfig(report));
  return <div className={styles.app}>
    <header className={styles.header}><Link href="/" className={styles.brand}>brooks<span>L</span><small>THE TOOLBOX</small></Link><span className={styles.model}>gpt-6.1-terra <i /> Lightroom on this Mac</span><Link href="/">All tools ↗</Link></header>
    <main className={styles.main}>
      <section className={styles.title}><div><p className={styles.eyebrow}>LIGHTROOM / PHOTO SELECTION</p><h1>Your photographs.<br className={styles.mobileBreak} /> A more <em>considered edit.</em></h1><p>Review the current Lightroom selection here. Lightroom handles the previews, Terra requests, saved results, and catalog changes.</p></div><button onClick={() => setSettings(v => !v)} aria-expanded={settings}>{settings ? "Hide targets ↑" : "Targets & budget ↓"}</button></section>
      {!connected && <section className={styles.connection} aria-label="Connect Lightroom"><h2>Connect Lightroom Classic</h2><ol><li>On this Mac, select the photographs you want in Lightroom.</li><li>Choose <strong>File → Plug-in Extras → Photo Similarity Helper: Rank &amp; Rate…</strong> to open a paired page.</li><li>Connect below and allow this site’s local / loopback network access if your browser asks.</li></ol><button className={styles.primary} disabled={!token || pending} onClick={() => void connect()}>{pending ? "Connecting…" : "Connect to Lightroom on this Mac"}</button><p>{token ? "This tab has a pairing from Lightroom. Chrome is recommended for the local connection." : "Open this page from the updated Lightroom plugin to pair it. A regular website link cannot access your catalog."}</p><p>The companion listens only on this Mac. Photos are not uploaded to brooksl.com. Terra previews go directly from Lightroom to OpenAI when you start comparisons.</p></section>}
      {notice && <div className={styles.notice} role="alert">{notice}</div>}
      {connected && <>
        <div className={styles.toolbar}><button className={styles.primary} disabled={busy} onClick={() => void command("selection", { config })}>Load / Refresh Lightroom selection</button><button disabled={busy} onClick={() => void command("resume")}>Resume latest saved ranking</button><button disabled={busy} onClick={() => void command("report")}>Refresh results</button><button disabled={busy} onClick={() => void command("disconnect")}>Disconnect</button><span className={styles.localNote}>{state?.catalog_name}</span></div>
        <div className={styles.status} role="status"><span className={busy ? styles.pulse : styles.dot} /><p>{state?.caption || "Connected to Lightroom."}</p>{state?.busy && <button onClick={() => void command("stop", {}, true)}>Stop</button>}</div>
        {state?.error && !state.busy && <div className={styles.notice}>{state.error}</div>}
        {settings && <section className={styles.settings} aria-label="Lightroom ranking targets"><div className={styles.targetSettings}><h2>Your selection</h2><div className={styles.fields}>
          <label>Goal<select disabled={busy} value={config.goal} onChange={e => setConfig({ ...config, goal: e.target.value as Config["goal"] })}><option value="best">Pick the best N</option><option value="percent">Keep a top percentage</option><option value="bands">Split into star bands</option><option value="threshold">Match saved reference stars</option><option value="rank">Rank only</option></select></label>
          {config.goal === "best" && <label>Number to keep<input type="number" min="1" disabled={busy} value={config.count} onChange={e => setConfig({ ...config, count: +e.target.value })} /></label>}
          {config.goal === "percent" && <label>Top percentage<input type="number" min="0" max="100" disabled={busy} value={config.percent} onChange={e => setConfig({ ...config, percent: +e.target.value })} /></label>}
          {config.goal === "bands" && <label>Stars : percent<input disabled={busy} value={config.bands} onChange={e => setConfig({ ...config, bands: e.target.value })} /></label>}
          {["best", "percent", "threshold"].includes(config.goal) && <><label>Lower stars<select disabled={busy} value={config.low} onChange={e => setConfig({ ...config, low: +e.target.value })}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label><label>Upper stars<select disabled={busy} value={config.high} onChange={e => setConfig({ ...config, high: +e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label></>}
          </div><label className={styles.check}><input type="checkbox" disabled={busy} checked={config.variety} onChange={e => setConfig({ ...config, variety: e.target.checked })} /> Prefer variety among similar-looking frames</label><p className={styles.hint}>Variety defers near repeats. It does not identify subjects or build a balanced slideshow.</p>
          <label>Photographic preferences<textarea disabled={busy} maxLength={3000} value={config.criteria} onChange={e => setConfig({ ...config, criteria: e.target.value })} placeholder="Prioritize clean backgrounds and strong bird poses…" /></label>
          <label>Purpose<select disabled={busy} value={config.purpose} onChange={e => setConfig({ ...config, purpose: e.target.value as Config["purpose"] })}><option value="photographic">Photographic highlights</option><option value="memories">Personal memories & storytelling</option></select></label>
          <label className={styles.check}><input type="checkbox" disabled={busy} checked={config.references ?? false} onChange={e => setConfig({ ...config, references: e.target.checked })} /> Include saved Lightroom reference examples</label>
        </div><div className={styles.apiSettings}><h2>Terra on your Mac</h2><p className={styles.hint}>Uses the OpenAI key already saved in the Lightroom plugin. The website never receives that key. Add or update it in the plugin’s Settings → API keys & tests.</p><div className={styles.fields}><label>Dispatch budget ($)<input disabled={busy} type="number" min="0" max="10000" value={config.budget} onChange={e => setConfig({ ...config, budget: +e.target.value })} /></label><label>Concurrent requests<select disabled={busy} value={config.workers} onChange={e => setConfig({ ...config, workers: +e.target.value })}>{[1, 3, 5, 8].map(n => <option key={n}>{n}</option>)}</select></label><label>Photos per comparison<select disabled={busy} value={config.size} onChange={e => setConfig({ ...config, size: +e.target.value })}>{[2, 4, 6, 8].map(n => <option key={n}>{n}</option>)}</select></label></div><p className={styles.hint}>Token costs and reservations are estimates, not a provider billing cap. Interrupted requests are never retried automatically.</p><button disabled={busy || !report} onClick={() => void command("configure", { config })}>Save targets & budget</button><p className={styles.hint}>Changing targets reuses saved comparisons. For new judging preferences, comparison size or reference choices, use Load / Refresh Lightroom selection to create a fresh snapshot.</p><button disabled={busy} onClick={() => void command("references")}>Save current Lightroom selection as references…</button><p className={styles.hint}>First select 2–60 rated reference examples in Lightroom. Save them here, then reselect your working set and refresh the selection. Existing snapshots keep their own references.</p></div></section>}
        {report && gallerySession && <>
          <div className={styles.summary}><div><strong>{(summary?.metrics.total ?? report.total).toLocaleString()}</strong><span>Lightroom photos</span></div><div><strong>{(summary?.metrics.compared ?? 0).toLocaleString()}</strong><span>compared · round {summary?.stage}</span></div><div><strong>{summary?.done.toLocaleString()}</strong><span>saved comparisons</span></div><div><strong>${summary?.spent.toFixed(3)}</strong><span>estimated · ${summary?.held.toFixed(3)} reserved</span></div><div className={styles.runActions}><button className={styles.primary} disabled={busy || !!changed} onClick={() => void command("start")}>Start / Resume Terra (paid) ↗</button><button disabled={busy || !!summary?.pending} onClick={() => void command("refine")}>Queue refinement</button></div></div>
          {!!summary?.uncertain && <div className={styles.recovery}><strong>{summary.uncertain} interrupted comparisons need attention.</strong><p>The provider may have charged already. Previous cost reservations remain held after skip or retry.</p><button disabled={busy} onClick={() => void command("resolve", { choice: "skip" })}>Skip interrupted requests</button><button disabled={busy} onClick={() => void command("resolve", { choice: "retry" })}>Queue explicit retries (may charge again)</button></div>}
          <div className={styles.reviewHeader}><div><h2>The Lightroom edit <span>{rows.length.toLocaleString()} photos</span></h2><p>{Object.entries(summary?.bands ?? {}).map(([stars, count]) => `${stars} ★: ${count}`).join(" · ") || "Compare photos or set manual stars to prepare rating proposals."}</p><p>Manual stars are staged locally. Preview / Apply shows the final confirmation in Lightroom before changing the catalog.</p></div><div className={styles.reviewActions}><button disabled={busy} onClick={exportCSV}>Export ratings CSV ↓</button><button disabled={busy} className={styles.primary} onClick={() => void command("apply")}>Preview / Apply Stars in Lightroom…</button><button disabled={busy} onClick={() => void command("restore")}>Restore last applied stars…</button></div></div>
          <div className={styles.filters}><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search filenames…" aria-label="Search Lightroom photos" /><select aria-label="Filter Lightroom photos" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All photographs</option><option value="boundary">Near the cutoff</option><option value="manual">Manual overrides</option>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} stars proposed</option>)}</select><span>Scroll the complete set · click a photo for full-screen review</span></div>
          <Gallery s={gallerySession} rows={rows} disabled={busy} onOpen={setSelected} onOverride={override} renderPreview={p => <LocalPreview token={token} photo={p} />} />
        </>}
      </>}
      <footer className={styles.footer}><span>Keep Lightroom running on this Mac. Closing this browser page does not stop comparisons already running in Lightroom.</span><span>Fresh selection on opening · saved reviews resume only when you choose them.</span></footer>
    </main>
    {photo && row && <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={`Lightroom photo review: ${photo.name}`} tabIndex={-1} id="lightroom-viewer"><div className={styles.viewerHeader}><div><strong>{photo.name}</strong><span>{index + 1} / {rows.length} · Lightroom rendering</span></div><button onClick={() => setSelected(null)}>Close ✕</button></div><div className={styles.viewerImage}><button aria-label="Previous photo" onClick={() => setSelected(rows[(index - 1 + rows.length) % rows.length].id)}>←</button><LocalPreview token={token} photo={photo} large /><button aria-label="Next photo" onClick={() => setSelected(rows[(index + 1) % rows.length].id)}>→</button></div><div className={styles.viewerDetails}><div><strong>{row.score == null ? "Awaiting comparisons" : `#${row.place} · ${row.score.toLocaleString()} / 10,000`}</strong><p>{row.reason || "No photographic judgment yet."}</p><span>{row.coverage} comparisons · arrows to browse · 0–5 to stage stars · Esc to close</span></div><label>Your staged stars<Stars label="Staged Lightroom stars" value={photo.override} disabled={busy} onChange={n => override(photo.id, n)} /><small>Proposed: {row.proposed ?? "unassigned"}</small></label></div></div>}
  </div>;
}
