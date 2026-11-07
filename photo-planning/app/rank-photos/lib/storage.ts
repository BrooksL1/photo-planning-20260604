import type { Photo, Session, Job } from "./core";
export type StoredPhoto = { key: string; session: string; meta: Photo; preview: Blob; thumb: Blob };
type StoredSession = Omit<Session, "photos" | "jobs">;
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("brooksl-rank-photos", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("sessions", { keyPath: "id" });
      request.result.createObjectStore("photos", { keyPath: "key" }).createIndex("session", "session");
      request.result.createObjectStore("jobs", { keyPath: "key" }).createIndex("session", "session");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error("Browser photo storage could not be opened.")); };
  });
}
async function transaction<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(new Error(tx.error?.name === "QuotaExceededError" ? "Browser storage is full. Free space or use a smaller photo set; saved comparisons are retained." : "Photo storage failed. No new comparison was started."));
  });
}
export async function save(s: Session, job?: Job) {
  s.version = crypto.randomUUID();
  const { photos: _photos, jobs: _jobs, ...meta } = s;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["jobs", "sessions"], "readwrite");
    if (job) tx.objectStore("jobs").put({ key: s.id + "/" + job.id, session: s.id, job });
    tx.objectStore("sessions").put(meta);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error("Browser storage failed. No new comparison was started; reopen the saved review before continuing."));
  });
}
export async function saveJobs(s: Session, replace = false) {
  s.version = crypto.randomUUID();
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["jobs", "sessions"], "readwrite");
    if (replace) {
      const retained = new Set(s.jobs.map(j => s.id + "/" + j.id));
      const keys = tx.objectStore("jobs").index("session").getAllKeys(s.id);
      keys.onsuccess = () => { for (const key of keys.result) if (!retained.has(String(key))) tx.objectStore("jobs").delete(key); };
    }
    for (const job of s.jobs) tx.objectStore("jobs").put({ key: s.id + "/" + job.id, session: s.id, job });
    const { photos: _photos, jobs: _jobs, ...meta } = s; tx.objectStore("sessions").put(meta);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error("Could not save the comparison queue."));
  });
}
export const putPhoto = (value: StoredPhoto) => transaction("photos", "readwrite", store => store.put(value));
export const getPhoto = (session: string, id: string): Promise<StoredPhoto | undefined> => transaction("photos", "readonly", store => store.get(session + "/" + id));
export async function updatePhoto(session: string, meta: Photo) {
  const p = await getPhoto(session, meta.id); if (!p) throw new Error("Saved preview is missing.");
  await putPhoto({ ...p, meta });
}
export const list = (): Promise<StoredSession[]> => transaction("sessions", "readonly", store => store.getAll());
export const head = (id: string): Promise<StoredSession | undefined> => transaction("sessions", "readonly", store => store.get(id));
export async function load(id: string): Promise<Session> {
  const [meta, photos, jobs] = await Promise.all([
    transaction<StoredSession>("sessions", "readonly", s => s.get(id)),
    transaction<StoredPhoto[]>("photos", "readonly", s => s.index("session").getAll(id)),
    transaction<{ job: Job }[]>("jobs", "readonly", s => s.index("session").getAll(id)),
  ]);
  if (!meta) throw new Error("This review was not found in this browser.");
  return { ...meta, photos: photos.map(p => p.meta), jobs: jobs.map(j => j.job).sort((a, b) => a.round - b.round || Number(a.id.split(":")[1]) - Number(b.id.split(":")[1])) };
}
export async function remove(id: string) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["sessions", "photos", "jobs"], "readwrite"); tx.objectStore("sessions").delete(id);
    for (const name of ["photos", "jobs"]) {
      const cursor = tx.objectStore(name).index("session").openKeyCursor(IDBKeyRange.only(id));
      cursor.onsuccess = () => { if (cursor.result) { tx.objectStore(name).delete(cursor.result.primaryKey); cursor.result.continue(); } };
    }
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error("Could not delete the browser review."));
  });
}
export async function imageData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read preview.")); reader.readAsDataURL(blob); });
}
function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not prepare preview.")), "image/jpeg", quality));
}
export async function prepare(file: File, session: string, ordinal: number): Promise<StoredPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > 150000000) throw new Error("Image exceeds the 150-megapixel browser limit.");
    const canvas = document.createElement("canvas"), scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = await jpeg(canvas, .78);
    if (preview.size > 400000) throw new Error("Prepared preview is too large.");
    const hash = await crypto.subtle.digest("SHA-256", await preview.arrayBuffer());
    const digest = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
    canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, 360 / Math.max(bitmap.width, bitmap.height))));
    canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, 360 / Math.max(bitmap.width, bitmap.height))));
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); const thumb = await jpeg(canvas, .7);
    canvas.width = 8; canvas.height = 8; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 8, 8); ctx.drawImage(bitmap, 0, 0, 8, 8);
    const rgba = ctx.getImageData(0, 0, 8, 8).data, visual: number[] = [];
    for (let i = 0; i < rgba.length; i++) if (i % 4 !== 3) visual.push(rgba[i]);
    const id = digest + "-" + ordinal;
    return { key: session + "/" + id, session, preview, thumb, meta: { id, name: file.webkitRelativePath || file.name, size: file.size, modified: file.lastModified, digest, width: bitmap.width, height: bitmap.height, visual } };
  } finally { bitmap.close(); }
}
