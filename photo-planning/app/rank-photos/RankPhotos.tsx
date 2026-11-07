"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { accounting, defaults, fit, MODEL, schedule, validate, type Config, type Photo, type Ranking, type Row, type Session } from "./lib/core";
import * as storage from "./lib/storage";
import { recover, run } from "./lib/runner";
import styles from "./rank.module.css";

function Preview({ session, photo, large = false }: { session: string; photo: Photo; large?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true, source = ""; setUrl("");
    storage.getPhoto(session, photo.id).then(value => {
      if (value && active) { source = URL.createObjectURL(large ? value.preview : value.thumb); setUrl(source); }
    }).catch(() => {});
    return () => { active = false; if (source) URL.revokeObjectURL(source); };
  }, [session, photo.id, large]);
  // Native image elements avoid sending private blob previews to an image proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={photo.name} draggable={false} /> : <span className={styles.loading}>Loading preview…</span>;
}
export function Stars({ value, onChange, disabled = false, label }: { value?: number | null; onChange: (n: number | undefined) => void; disabled?: boolean; label: string }) {
  return <select aria-label={label} value={value ?? "auto"} disabled={disabled} onChange={e => onChange(e.target.value === "auto" ? undefined : Number(e.target.value))}>
    <option value="auto">Automatic</option>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n ? "★".repeat(n) : "stars"}</option>)}
  </select>;
}
export function Gallery({ s, rows, disabled, onOpen, onOverride, renderPreview }: { s: Session; rows: Row[]; disabled: boolean; onOpen: (id: string) => void; onOverride: (id: string, n?: number) => void; renderPreview?: (photo: Photo) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 1000, height: 700, top: 0 });
  useEffect(() => {
    const el = ref.current!;
    const resize = new ResizeObserver(() => setSize(p => ({ ...p, width: el.clientWidth, height: el.clientHeight }))); resize.observe(el);
    return () => resize.disconnect();
  }, []);
  const photos = useMemo(() => new Map(s.photos.map(p => [p.id, p])), [s.photos, s.photos.length]);
  const columns = Math.max(1, Math.floor(size.width / 250)), rowHeight = 350;
  const start = Math.max(0, Math.floor(size.top / rowHeight) - 2), end = Math.min(Math.ceil(rows.length / columns), Math.ceil((size.top + size.height) / rowHeight) + 2);
  return <div ref={ref} className={styles.gallery} onScroll={e => { const top = e.currentTarget.scrollTop; setSize(p => ({ ...p, top })); }} aria-label="Scrollable photo review" tabIndex={0}>
    {!rows.length && <p className={styles.noMatches}>No photos match this filter.</p>}
    <div style={{ height: Math.ceil(rows.length / columns) * rowHeight, position: "relative" }}>
      <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, top: start * rowHeight }}>
        {rows.slice(start * columns, end * columns).map(r => { const p = photos.get(r.id)!; return <article className={styles.card} key={p.id}>
          <button className={styles.photoButton} onClick={() => onOpen(p.id)} aria-label={`Open ${p.name} full screen`}>{renderPreview ? renderPreview(p) : <Preview session={s.id} photo={p} />}{r.score != null && r.place != null && <span>#{r.place}</span>}</button>
          <div className={styles.cardBody}><strong title={p.name}>{p.name}</strong>
            <div className={styles.cardStats}>{r.score == null ? "Awaiting connected comparisons" : `${r.score.toLocaleString()} / 10,000`}{r.score != null && r.boundary && <b>Cutoff</b>}</div>
            <div className={styles.ratingLine}><span>{r.proposed == null ? "No stars assigned" : `${r.proposed} ★`}{p.override != null ? " · edited" : " proposed"}</span><Stars value={p.override} onChange={n => onOverride(p.id, n)} disabled={disabled} label={`Override stars for ${p.name}`} /></div>
            <p title={r.reason}>{r.reason || `${r.coverage} completed comparisons`}</p>
          </div>
        </article>; })}
      </div>
    </div>
  </div>;
}
function csvCell(v: unknown) { const value = String(v ?? ""); return '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"'; }
function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export default function RankPhotos() {
  const [session, setSession] = useState<Session | null>(null), current = useRef<Session | null>(null);
  const [ranking, setRanking] = useState<Ranking>({ rows: [], components: 0, compared: 0 });
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof storage.list>>>([]), [config, setConfig] = useState<Config>(defaults);
  const [key, setKey] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [status, setStatus] = useState("Choose photos to create a private review in this browser.");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [selected, setSelected] = useState<string | null>(null), [settings, setSettings] = useState(true);
  const stop = useRef(false), fileInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null), backupInput = useRef<HTMLInputElement>(null), revision = useRef(0);
  const refreshReviews = () => storage.list().then(v => setReviews(v.sort((a, b) => b.created - a.created)));
  useEffect(() => { refreshReviews().catch(e => setNotice(e.message)); }, []);
  useEffect(() => { if (folderInput.current) folderInput.current.setAttribute("webkitdirectory", ""); }, []);
  useEffect(() => { if (!busy) return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [busy]);
  function adopt(s: Session) { current.current = s; setSession({ ...s }); }
  async function compute(s: Session) { const version = ++revision.current, value = await fit(s); if (current.current?.id === s.id && version === revision.current) setRanking(value); }
  async function guarded(fn: () => Promise<void>, exclusive = false) {
    setBusy(true); setNotice("");
    try {
      if (exclusive) {
        if (!navigator.locks) throw new Error("Use a current browser with Web Locks support.");
        await navigator.locks.request("brooksl-photo-ranking", { ifAvailable: true }, async lock => {
          if (!lock) throw new Error("A ranking is running in another tab. Stop it there first.");
          const s = current.current;
          if (s && (await storage.head(s.id))?.version !== s.version) throw new Error("This review changed in another tab. Open the saved review again before editing.");
          await fn();
        });
      } else await fn();
    } catch (e) { setNotice(e instanceof Error ? e.message : "The operation could not be completed."); }
    finally { setBusy(false); }
  }
  async function openReview(id: string) {
    if (!id || busy) return;
    await guarded(async () => {
      const s = await storage.load(id);
      // Recovery is performed under the cross-tab lock, never on a live runner.
      if (!navigator.locks) throw new Error("Use a current browser with Web Locks support.");
      await navigator.locks.request("brooksl-photo-ranking", { ifAvailable: true }, async lock => { if (!lock) throw new Error("A ranking is running in another tab."); await recover(s); });
      adopt(s); setConfig(s.config); setSearch(""); setFilter("all"); setSelected(null); setSettings(false); await compute(s);
      setStatus(s.ready ? "Saved review opened. No paid requests started." : "This import was interrupted. Choose a new photo set to start again.");
    });
  }
  async function importPhotos(files: FileList | null) {
    if (!files?.length || busy) return;
    const candidates = [...files].filter(f => /\.(jpe?g|png|webp|avif|heic|heif|tiff?|bmp|gif)$/i.test(f.name));
    if (candidates.length < 2 || candidates.length > 100000) { setNotice("Choose 2–100,000 still photos. Export RAW files as JPEGs first."); return; }
    await guarded(async () => {
      validate(config); stop.current = false;
      const s: Session = { id: crypto.randomUUID(), name: `Review · ${new Date().toLocaleDateString()} · ${candidates.length} photos`, created: Date.now(), config: { ...config }, photos: [], jobs: [], round: 0, ready: false, importErrors: [] };
      await storage.save(s); adopt(s); setRanking({ rows: [], components: 0, compared: 0 }); setSelected(null); setSearch(""); setFilter("all");
      navigator.storage?.persist?.().catch(() => {});
      for (let i = 0; i < candidates.length; i++) {
        if (stop.current) break;
        setStatus(`Preparing ${i + 1} / ${candidates.length} · previews stay in this browser`);
        try { const photo = await storage.prepare(candidates[i], s.id, i); await storage.putPhoto(photo); s.photos.push(photo.meta); }
        catch (e) { const message = e instanceof Error ? e.message : "Unreadable image"; if (/storage|space/i.test(message)) throw e; s.importErrors.push(candidates[i].name + ": " + message); }
        if (i % 50 === 0) await storage.save(s);
      }
      s.ready = !stop.current && s.photos.length >= 2;
      if (s.ready) { if (s.config.goal !== "threshold") schedule(s); await storage.saveJobs(s); }
      else await storage.save(s);
      adopt(s); await compute(s); await refreshReviews();
      setStatus(s.ready ? `${s.photos.length.toLocaleString()} photos ready. Start Terra when you are ready to send comparisons.` : "Import stopped. Saved previews remain; choose a new set to create a complete review.");
      if (s.importErrors.length) setNotice(`${s.importErrors.length} files could not be prepared. Review the import report below. They will not receive invented rankings.`);
    });
    if (fileInput.current) fileInput.current.value = ""; if (folderInput.current) folderInput.current.value = "";
  }
  async function updateConfig() {
    await guarded(async () => {
      const value = validate(config); const s = current.current;
      if (s) {
        const started = s.jobs.some(j => j.status !== "pending");
        if (started && (value.criteria !== s.config.criteria || value.purpose !== s.config.purpose || value.size !== s.config.size)) throw new Error("Create a new photo set to change the photographic preferences, purpose or comparison size.");
        s.config = value;
        if (!started) { s.jobs = []; s.round = 0; if (s.ready && value.goal !== "threshold") schedule(s); await storage.saveJobs(s, true); }
        else await storage.save(s);
        adopt(s); await compute(s); setStatus("Targets updated using the saved comparison evidence.");
      } else setConfig(value);
    }, true);
  }
  async function setPhoto(id: string, field: "override" | "reference", value?: number) {
    if (busy || !current.current) return;
    const s = current.current;
    if (field === "reference" && s.jobs.some(j => j.status !== "pending")) { setNotice("Reference examples are fixed once comparisons start. Create a new photo set to change them."); return; }
    await guarded(async () => {
      const p = s.photos.find(p => p.id === id)!; const updated = { ...p, [field]: value }; await storage.updatePhoto(s.id, updated);
      s.photos = s.photos.map(p => p.id === id ? updated : p); await storage.save(s); adopt(s); await compute(s);
    }, true);
  }
  async function start(refine = false) {
    const s = current.current; if (!s?.ready || busy) return;
    if (!/^sk-[A-Za-z0-9_-]{16,500}$/.test(key)) { setSettings(true); setNotice("Enter your OpenAI API key. It is kept only in this tab’s memory."); return; }
    if (JSON.stringify(config) !== JSON.stringify(s.config)) { setNotice("Save your target changes before starting."); setSettings(true); return; }
    if (s.importErrors.length && !window.confirm(`${s.importErrors.length} files were unreadable and are excluded. Start paid comparisons for the ${s.photos.length} readable photos?`)) return;
    await guarded(async () => {
      validate(s.config);
      if (s.config.goal === "threshold" && ![s.config.low, s.config.high].every(n => s.photos.some(p => p.reference === n))) throw new Error("Open photos and mark reference examples at both chosen star levels first.");
      stop.current = false; setSettings(false); setStatus("Comparing with GPT-6.1 Terra. Keep this tab open.");
      const message = await run(s, key, () => stop.current, value => { adopt(s); if (value) setRanking(value); }, undefined, refine);
      adopt(s); await compute(s); setStatus(message);
    });
  }
  async function resolve(retry: boolean) {
    if (!current.current || busy) return;
    await guarded(async () => {
      const s = current.current!;
      for (const j of [...s.jobs]) if (j.status === "uncertain") {
        j.status = "abandoned";
        if (retry) s.jobs.push({ ...j, id: `${s.round}:${s.jobs.length}`, status: "pending", reserve: 0, cost: 0, value: undefined, error: undefined });
      }
      await storage.saveJobs(s); adopt(s); setStatus(retry ? "Retry explicitly queued. The earlier unknown charge stays reserved. Press Start / Resume Terra to send." : "Interrupted comparisons skipped. Their possible charges remain reserved.");
    }, true);
  }
  const photos = useMemo(() => new Map(session?.photos.map(p => [p.id, p]) ?? []), [session?.photos, session?.photos.length]);
  const rows = useMemo(() => ranking.rows.filter(r => {
    const p = photos.get(r.id); if (!p) return false;
    return p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || filter === "boundary" && r.boundary || filter === "uncompared" && !r.coverage || filter === "manual" && p.override != null || String(r.proposed) === filter);
  }), [ranking.rows, photos, search, filter]);
  const selectedIndex = rows.findIndex(r => r.id === selected), selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : undefined, selectedPhoto = selected ? photos.get(selected) : undefined;
  useEffect(() => {
    if (!selected) return;
    const before = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById("photo-review-dialog"); dialog?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelected(null); return; }
      if ((e.target as HTMLElement)?.matches("input,select,textarea")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setSelected(rows[(selectedIndex + (e.key === "ArrowRight" ? 1 : -1) + rows.length) % rows.length]?.id ?? null); }
      if (/^[0-5]$/.test(e.key)) void setPhoto(selected, "override", Number(e.key));
      if (e.key === "Tab" && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled),select:not(:disabled),a[href]")];
        if (e.shiftKey && (document.activeElement === focusable[0] || document.activeElement === dialog)) { e.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0]?.focus(); }
      }
    };
    window.addEventListener("keydown", handler); return () => { window.removeEventListener("keydown", handler); before?.focus(); };
  // Event handler uses the latest review state, including manual star edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedIndex, rows, busy]);
  const a = session ? accounting(session) : { spent: 0, held: 0, done: 0, pending: 0, uncertain: 0 };
  const started = session?.jobs.some(j => j.status !== "pending") ?? false;
  function exportCSV() {
    if (!session) return;
    const lines = [["filename", "rank", "relative_score", "proposed_stars", "automatic_stars", "manual_stars", "comparisons", "near_cutoff", "reason", "preview_sha256"], ...ranking.rows.map(r => { const p = photos.get(r.id)!; return [p.name, r.place, r.score, r.proposed, r.automatic, p.override, r.coverage, r.boundary, r.reason, p.digest]; })];
    download("rank-and-rate.csv", "\uFEFF" + lines.map(line => line.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  async function exportBackup() {
    if (!session) return;
    await guarded(async () => {
      setStatus("Preparing a review backup including previews…");
      // Blob parts avoid concatenating every encoded photo into one giant string.
      const parts: BlobPart[] = ['{"format":"brooksl-rank-v1","session":', JSON.stringify(session), ',"images":['];
      let bytes = new Blob(parts).size;
      for (let i = 0; i < session.photos.length; i++) { const p = await storage.getPhoto(session.id, session.photos[i].id); if (!p) throw new Error("Missing saved preview."); if (i) parts.push(","); const item = JSON.stringify({ id: p.meta.id, preview: await storage.imageData(p.preview), thumb: await storage.imageData(p.thumb) }); bytes += item.length + 1; if (bytes > 299000000) throw new Error("This review exceeds the 300 MB portable backup limit. Export the ratings CSV and retain the review in this browser, or work in smaller sets."); parts.push(item); if (i % 50 === 0) setStatus(`Backing up ${i + 1} / ${session.photos.length}`); }
      parts.push("]}"); const blob = new Blob(parts, { type: "application/json" }), url = URL.createObjectURL(blob), el = document.createElement("a"); el.href = url; el.download = "rank-and-rate-backup.json"; el.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); setStatus("Review backup downloaded. It includes previews and results, never your API key.");
    });
  }
  async function importBackup(file: File | undefined) {
    if (!file || busy) return;
    await guarded(async () => {
      if (file.size > 300000000) throw new Error("This backup exceeds the 300 MB browser import limit. Open the original browser review or split the photo set.");
      const raw = JSON.parse(await file.text());
      if (raw.format !== "brooksl-rank-v1" || !Array.isArray(raw.images)) throw new Error("Choose a Rank & Rate review backup.");
      const s = raw.session as Session;
      validate(s.config);
      if (!Array.isArray(s.photos) || s.photos.length < 2 || s.photos.length > 100000 || !Array.isArray(s.jobs) || new Set(s.photos.map(p => p.id)).size !== s.photos.length || raw.images.length !== s.photos.length) throw new Error("Incomplete review backup.");
      const all = new Set(s.photos.map(p => p.id));
      for (const p of s.photos) { if (typeof p.id !== "string" || typeof p.name !== "string" || p.name.length > 4096 || !Array.isArray(p.visual) || p.visual.length !== 192 || p.visual.some(n => typeof n !== "number" || n < 0 || n > 255) || p.override != null && (!Number.isInteger(p.override) || p.override < 0 || p.override > 5) || p.reference != null && (!Number.isInteger(p.reference) || p.reference < 0 || p.reference > 5)) throw new Error("Invalid saved photo."); }
      const { validateEvidence, numeric } = await import("./lib/core");
      for (const j of s.jobs) { if (!Array.isArray(j.ids) || j.ids.length < 2 || j.ids.length > 8 || new Set(j.ids).size !== j.ids.length || j.ids.some(id => !all.has(id)) || !["pending", "sent", "done", "uncertain", "abandoned"].includes(j.status)) throw new Error("Invalid comparison backup."); numeric(j.cost, 0, 10000, "saved cost"); numeric(j.reserve, 0, 10000, "saved reservation"); if (j.status === "done") validateEvidence(j.value, j.ids); }
      if (!Number.isInteger(s.round) || s.round < 0 || s.round > 10000 || typeof s.ready !== "boolean" || !Array.isArray(s.importErrors)) throw new Error("Invalid session backup.");
      const ready = s.ready; s.ready = false;
      s.id = crypto.randomUUID(); s.name = "Imported · " + String(s.name).slice(0, 150); s.created = Date.now();
      await storage.save(s);
      const imageIds = new Set<string>();
      for (const image of raw.images) {
        if (!all.has(image.id) || imageIds.has(image.id) || typeof image.preview !== "string" || image.preview.length > 540000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image.preview) || typeof image.thumb !== "string" || image.thumb.length > 200000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image.thumb)) throw new Error("Invalid backup preview.");
        imageIds.add(image.id); const p = s.photos.find(p => p.id === image.id)!;
        const preview = await (await fetch(image.preview)).blob(), thumb = await (await fetch(image.thumb)).blob();
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await preview.arrayBuffer()))].map(n => n.toString(16).padStart(2, "0")).join("");
        if (digest !== p.digest) throw new Error("Backup preview does not match its saved comparisons.");
        await storage.putPhoto({ key: s.id + "/" + p.id, session: s.id, meta: p, preview, thumb });
      }
      s.ready = ready; await recover(s); await storage.saveJobs(s); adopt(s); setConfig(s.config); setSearch(""); setFilter("all"); setSelected(null); await compute(s); await refreshReviews(); setStatus("Review backup restored. No paid requests started.");
    });
    if (backupInput.current) backupInput.current.value = "";
  }
  return <div className={styles.app}>
    <header className={styles.header}><Link href="/" className={styles.brand}>brooks<span>L</span><small>THE TOOLBOX</small></Link><span className={styles.model}>{MODEL} <i /> browser workspace</span><Link href="/">All tools ↗</Link></header>
    <main className={styles.main}>
      <section className={styles.title}><div><p className={styles.eyebrow}>PHOTO SELECTION / 03</p><h1>Keep the <em>best.</em><br className={styles.mobileBreak} /> Make room for the rest.</h1><p>Small comparisons. A considered edit. Rank a handful of photographs or work through a whole year.</p></div><button onClick={() => setSettings(v => !v)} aria-expanded={settings}>{settings ? "Hide settings ↑" : "Targets & API key ↓"}</button></section>
      <div className={styles.toolbar}>
        <input hidden type="file" multiple accept="image/*" ref={fileInput} onChange={e => void importPhotos(e.target.files)} />
        <input hidden type="file" multiple accept="image/*" ref={folderInput} onChange={e => void importPhotos(e.target.files)} />
        <input hidden type="file" accept="application/json,.json" ref={backupInput} onChange={e => void importBackup(e.target.files?.[0])} />
        <button className={styles.primary} disabled={busy} onClick={() => fileInput.current?.click()}>＋ Choose photos</button>
        <button disabled={busy} onClick={() => folderInput.current?.click()}>Choose folder</button>
        <select aria-label="Open a saved review" disabled={busy} value={session?.id ?? ""} onChange={e => void openReview(e.target.value)}><option value="">Saved reviews in this browser</option>{reviews.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select>
        <button disabled={busy} onClick={() => backupInput.current?.click()}>Import backup</button>
        <span className={styles.localNote}>Originals stay on your device.</span>
      </div>
      {settings && <section className={styles.settings} aria-label="Ranking settings">
        <div className={styles.targetSettings}><h2>Your selection</h2><div className={styles.fields}>
          <label>Goal<select disabled={busy} value={config.goal} onChange={e => setConfig({ ...config, goal: e.target.value as Config["goal"] })}><option value="best">Pick the best N</option><option value="percent">Keep a top percentage</option><option value="bands">Split into star bands</option><option value="threshold">Match reference stars</option><option value="rank">Rank only</option></select></label>
          {config.goal === "best" && <label>Number to keep<input type="number" min="1" max="100000" disabled={busy} value={config.count} onChange={e => setConfig({ ...config, count: Number(e.target.value) })} /></label>}
          {config.goal === "percent" && <label>Top percentage<input type="number" min="0" max="100" disabled={busy} value={config.percent} onChange={e => setConfig({ ...config, percent: Number(e.target.value) })} /></label>}
          {config.goal === "bands" && <label>Stars : percent<input disabled={busy} value={config.bands} onChange={e => setConfig({ ...config, bands: e.target.value })} placeholder="3:75,4:25" /></label>}
          {["best", "percent", "threshold"].includes(config.goal) && <><label>Lower stars<select disabled={busy} value={config.low} onChange={e => setConfig({ ...config, low: +e.target.value })}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label><label>Upper stars<select disabled={busy} value={config.high} onChange={e => setConfig({ ...config, high: +e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label></>}
        </div>
          <label className={styles.check}><input type="checkbox" disabled={busy || !["best", "percent"].includes(config.goal)} checked={config.variety} onChange={e => setConfig({ ...config, variety: e.target.checked })} /> Prefer variety among similar-looking frames</label>
          <p className={styles.hint}>Variety reduces obvious whole-frame repeats near the selection cutoff. It does not identify events or build a balanced slideshow.</p>
          {config.goal === "threshold" && <p className={styles.hint}>Open photos and mark reference examples at both star levels before starting. Conflicting reference order leaves stars unassigned.</p>}
          <label>Photographic preferences<textarea maxLength={3000} disabled={busy || started} value={config.criteria} onChange={e => setConfig({ ...config, criteria: e.target.value })} placeholder="For example: prioritize clean backgrounds and strong bird poses." /></label>
          <label>Purpose<select disabled={busy || started} value={config.purpose} onChange={e => setConfig({ ...config, purpose: e.target.value as Config["purpose"] })}><option value="photographic">Photographic highlights</option><option value="memories">Personal memories & storytelling</option></select></label>
          <button disabled={busy} onClick={() => void updateConfig()}>{session ? "Save targets & budget" : "Check settings"}</button><p className={styles.hint}>Targets reuse saved evidence. Preferences and reference examples are fixed once comparisons start.</p>
        </div>
        <div className={styles.apiSettings}><h2>Terra comparisons</h2><label>OpenAI API key<input type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy} onChange={e => setKey(e.target.value.trim())} placeholder="sk-…" /></label><p className={styles.hint}>Your key stays in this tab’s memory and passes through the site only to OpenAI. It is never saved in reviews or backups. Only anonymous JPEG previews and your preferences are sent for comparison.</p>
          <div className={styles.fields}><label>Dispatch budget ($)<input type="number" min="0" max="10000" step="1" disabled={busy} value={config.budget} onChange={e => setConfig({ ...config, budget: +e.target.value })} /></label><label>Concurrent requests<select disabled={busy} value={config.workers} onChange={e => setConfig({ ...config, workers: +e.target.value })}>{[1, 2, 3, 5, 8].map(n => <option key={n}>{n}</option>)}</select></label><label>Photos per comparison<select disabled={busy || started} value={config.size} onChange={e => setConfig({ ...config, size: +e.target.value })}>{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n}>{n}</option>)}</select></label></div>
          <p className={styles.hint}>The dispatch budget uses conservative reservations and token-cost estimates, not a provider billing cap. Smaller concurrency helps with rate limits. Keep this tab open while work runs.</p>
          <p className={styles.hint}>JPEG, PNG, WebP and other browser-readable stills. Export RAW photos from Lightroom as JPEGs first. Browser storage capacity limits very large sets.</p>
          {key && <button disabled={busy} onClick={() => setKey("")}>Forget API key</button>}
        </div>
      </section>}
      <div className={styles.status} role="status"><span className={busy ? styles.pulse : styles.dot} /><p>{status}</p>{busy && <button onClick={() => { stop.current = true; setStatus("Stopping after requests already in flight finish…"); }}>Stop</button>}</div>
      {notice && <div className={styles.notice} role="alert">{notice}</div>}
      {session?.importErrors.length ? <details className={styles.errorReport}><summary>{session.importErrors.length} excluded / unreadable files</summary><pre>{session.importErrors.join("\n")}</pre></details> : null}
      {session ? <>
        <div className={styles.summary}><div><strong>{session.photos.length.toLocaleString()}</strong><span>photographs</span></div><div><strong>{ranking.compared.toLocaleString()}</strong><span>compared · round {session.round}</span></div><div><strong>{a.done.toLocaleString()}</strong><span>saved comparisons</span></div><div><strong>${a.spent.toFixed(3)}</strong><span>estimated · ${a.held.toFixed(3)} reserved</span></div><div className={styles.runActions}><button className={styles.primary} disabled={busy || !session.ready} onClick={() => void start()}>Start / Resume Terra ↗</button><button disabled={busy || !a.done || !!a.pending || !!a.uncertain} onClick={() => void start(true)}>Refine comparisons</button></div></div>
        {!!a.uncertain && <div className={styles.recovery}><strong>{a.uncertain} interrupted comparisons need attention.</strong><p>No paid request is retried automatically. Unknown charges stay reserved even if you retry or skip.</p><button disabled={busy} onClick={() => void resolve(true)}>Queue explicit retries</button><button disabled={busy} onClick={() => void resolve(false)}>Skip interrupted comparisons</button><details><summary>Details</summary>{session.jobs.filter(j => j.status === "uncertain").map(j => <p key={j.id}>{j.error}</p>)}</details></div>}
        <div className={styles.reviewHeader}><div><h2>The edit <span>{rows.length.toLocaleString()} photos</span></h2><p>{ranking.components > 1 || ranking.compared < session.photos.length ? "Global scores and automatic stars wait until every photo belongs to one connected comparison set." : "Scores describe this set’s relative order. Close calls remain for you to decide."}</p></div><div className={styles.reviewActions}><button disabled={busy} onClick={() => void openReview(session.id)}>Reload saved review</button><button disabled={busy} onClick={exportCSV}>Export ratings CSV ↓</button><button disabled={busy} onClick={() => void exportBackup()}>Back up review ↓</button><button disabled={busy} onClick={() => { if (window.confirm("Delete this review and its previews from this browser? Your original photos are unaffected.")) void guarded(async () => { await storage.remove(session.id); current.current = null; setSession(null); setRanking({ rows: [], components: 0, compared: 0 }); await refreshReviews(); setStatus("Browser review deleted."); }, true); }}>Delete review</button></div></div>
        <div className={styles.filters}><input type="search" placeholder="Search filenames…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search photo filenames" /><select aria-label="Filter photos" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All photographs</option><option value="boundary">Near the cutoff</option><option value="uncompared">Not yet compared</option><option value="manual">Manual star overrides</option>{[0, 1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{n} stars proposed</option>)}</select><span>Scroll the complete set · click a photo for full-screen review</span></div>
        <Gallery s={session} rows={rows} disabled={busy} onOpen={setSelected} onOverride={(id, n) => void setPhoto(id, "override", n)} />
      </> : <section className={styles.empty}><div className={styles.emptyArt} aria-hidden="true"><span /><span /><span /></div><p className={styles.eyebrow}>YOUR NEXT EDIT STARTS HERE</p><h2>Forty birds.<br />Or a year of photographs.</h2><p>Choose a set, tell Terra what matters, then review every frame.<br />Your original files are never changed.</p><button disabled={busy} className={styles.primary} onClick={() => fileInput.current?.click()}>Choose your photographs ↗</button></section>}
      <footer className={styles.footer}><span>Reviews and previews are stored in this browser, with no account or cross-device sync. Back up important reviews before clearing browser data.</span><span>CSV exports contain proposed ratings. Lightroom catalogs are not changed by this website.</span></footer>
    </main>
    {session && selectedPhoto && selectedRow && <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={`Photo review: ${selectedPhoto.name}`} tabIndex={-1} id="photo-review-dialog">
      <div className={styles.viewerHeader}><div><strong>{selectedPhoto.name}</strong><span>{selectedIndex + 1} / {rows.length} · {selectedPhoto.width} × {selectedPhoto.height} original · up to 1024px preview</span></div><button onClick={() => setSelected(null)} aria-label="Close full-screen photo review">Close ✕</button></div>
      <div className={styles.viewerImage}><button aria-label="Previous photo" onClick={() => setSelected(rows[(selectedIndex - 1 + rows.length) % rows.length].id)}>←</button><Preview session={session.id} photo={selectedPhoto} large /><button aria-label="Next photo" onClick={() => setSelected(rows[(selectedIndex + 1) % rows.length].id)}>→</button></div>
      <div className={styles.viewerDetails}><div><strong>{selectedRow.place == null ? "Awaiting connected comparisons" : `#${selectedRow.place} · ${selectedRow.score?.toLocaleString()} / 10,000`}</strong><p>{selectedRow.reason || "No photographic judgment yet."}</p><span>{selectedRow.coverage} comparisons{selectedRow.boundary ? " · near cutoff" : ""} · arrows to browse · 0–5 to set stars · Esc to close</span></div><label>Your stars <Stars value={selectedPhoto.override} label="Override stars for current photo" disabled={busy} onChange={n => void setPhoto(selectedPhoto.id, "override", n)} /><small>Proposed: {selectedRow.proposed ?? "unassigned"}</small></label><label>Reference example<Stars value={selectedPhoto.reference} label="Reference stars for current photo" disabled={busy || started} onChange={n => void setPhoto(selectedPhoto.id, "reference", n)} /><small>Used for reference thresholds</small></label></div>
    </div>}
  </div>;
}
