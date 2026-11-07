import { accounting, fit, reservation, schedule, validate, validateEvidence, type Session, type Ranking, type Job } from "./core";
import { getPhoto, head, imageData, save, saveJobs } from "./storage";
export async function recover(s: Session) {
  for (const j of s.jobs) if (j.status === "sent") { j.status = "uncertain"; j.error = "Browser closed before the result was saved. Review before retrying."; await save(s, j); }
}
export async function run(s: Session, key: string, stopped: () => boolean, update: (ranking?: Ranking) => void, compare = async (body: unknown): Promise<unknown> => {
  const response = await fetch("/api/rank-photos/compare", { method: "POST", headers: { "Content-Type": "application/json", "x-openai-key": key }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Comparison failed; its charge remains reserved."); return result;
}, refine = false): Promise<string> {
  validate(s.config);
  if (!navigator.locks) throw new Error("This browser does not support safe cross-tab coordination. Use a current browser over HTTPS.");
  return navigator.locks.request("brooksl-photo-ranking", { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("A ranking is already running in another tab. Stop it there first.");
    if ((await head(s.id))?.version !== s.version) throw new Error("This review changed in another tab. Open the saved review again before continuing.");
    await recover(s);
    if (s.jobs.some(j => j.status === "uncertain")) throw new Error("Resolve interrupted comparisons before continuing.");
    let latest = await fit(s), blocked = false, failure = "";
    if (refine) {
      if (s.jobs.some(j => ["pending", "sent", "uncertain"].includes(j.status))) throw new Error("Finish or resolve the current comparisons before refining.");
      schedule(s, latest, true); await saveJobs(s);
    }
    // Claims and reservations are serialized even with concurrent network requests.
    let gate = Promise.resolve();
    function serialized<T>(fn: () => Promise<T>): Promise<T> {
      const next = gate.then(fn); gate = next.then(() => undefined, () => undefined); return next;
    }
    while (!stopped()) {
      if (!s.jobs.some(j => j.status === "pending")) {
        if (s.round >= 4) return "Scheduled comparisons complete. Review the cutoff or request another refinement round.";
        schedule(s, latest); await saveJobs(s);
      }
      let dispatched = 0;
      async function worker() {
        while (!stopped() && !failure) {
          const job = await serialized(async (): Promise<Job | undefined> => {
            if (stopped() || failure) return;
            const next = s.jobs.find(j => j.status === "pending"); if (!next) return;
            const a = accounting(s), reserve = reservation(next.ids.length);
            if (a.spent + a.held + reserve > s.config.budget + 1e-10) { blocked = true; return; }
            next.status = "sent"; next.reserve = reserve;
            // Persist before HTTP. A failed write can never start a paid request.
            try { await save(s, next); } catch (error) { next.status = "pending"; next.reserve = 0; throw error; }
            dispatched++; update(); return next;
          });
          if (!job) return;
          try {
            const images: string[] = [];
            for (const id of job.ids) {
              const photo = await getPhoto(s.id, id); if (!photo) throw new Error("Saved photo preview is missing.");
              images.push(await imageData(photo.preview));
            }
            const result = validateEvidence(await compare({ images, criteria: s.config.criteria, purpose: s.config.purpose }), job.ids.map((_, i) => "P" + (i + 1)));
            const mapping = new Map(job.ids.map((id, i) => ["P" + (i + 1), id]));
            job.value = { ...result, tiers: result.tiers.map(tier => tier.map(label => mapping.get(label)!)), reasons: Object.fromEntries(Object.entries(result.reasons).map(([label, reason]) => [mapping.get(label)!, reason])) };
            job.cost = (result.input + 5 * result.output) / 1e6; job.status = "done"; job.reserve = 0;
            // Save completed usage even when Stop was pressed during the request.
            await serialized(() => save(s, job)); update();
          } catch (error) {
            job.status = "uncertain"; job.error = error instanceof Error ? error.message : "Comparison ended without a saved result.";
            failure = job.error;
            await serialized(() => save(s, job)); update();
          }
        }
      }
      const workers = await Promise.allSettled(Array.from({ length: s.config.workers }, () => worker()));
      for (const w of workers) if (w.status === "rejected") failure = w.reason instanceof Error ? w.reason.message : "Could not save browser review.";
      latest = await fit(s); update(latest);
      if (failure) return failure;
      if (blocked && s.jobs.some(j => j.status === "pending")) return "Dispatch budget reached. Increase the budget to continue; completed comparisons remain saved.";
      if (!dispatched && s.jobs.some(j => j.status === "pending")) return "No additional comparison could be started.";
    }
    return "Stopped. Completed comparisons are saved; in-flight results were allowed to finish.";
  });
}
