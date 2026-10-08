// Cloud save for the published artifact: your progress (and the time of day) follows you
// on this link, on any device you open it with. Uses the page's per-viewer db document
// data/users/<you>/barber. Without the runtime (local dev, the mac app, a portal) this is
// a no-op and localStorage does the job alone.
export const cloud = {
  ref: null,
  ready: false,
  writing: false,
  queued: null,
  lastJson: '',
  lastWrite: 0,

  // resolves the remote save (parsed) or null
  async init() {
    try {
      if (!window.claude?.use) return null;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return null;
      const uid = await user.id();
      if (!uid) return null;
      this.ref = db.collection('data/users/' + uid).doc('barber');
      const snap = await this.ref.get();
      this.ready = true;
      if (!snap.exists) return null;
      const d = snap.data();
      this.lastJson = d.save || '';
      return {
        save: d.save ? JSON.parse(d.save) : null,
        settings: d.settings ? JSON.parse(d.settings) : null,
        at: d.at || 0,
      };
    } catch (e) {
      console.warn('cloud save unavailable', e?.code || e);
      this.ref = null;
      return null;
    }
  },

  // coalesced: at most one write in flight, and not more often than every few seconds
  push(save, settings, now = false) {
    if (!this.ref) return;
    const json = JSON.stringify(save);
    if (json === this.lastJson && !now) return;
    this.queued = { save: json, settings: JSON.stringify(settings) };
    if (this.writing || this.timer) return;
    const wait = now ? 0 : Math.max(0, 4000 - (Date.now() - this.lastWrite));
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, wait);
  },

  async flush() {
    if (!this.ref || !this.queued || this.writing) return;
    const q = this.queued;
    this.queued = null;
    if (q.save === this.lastJson) return;
    this.writing = true;
    try {
      await this.ref.set({ v: 1, save: q.save, settings: q.settings, at: Date.now() });
      this.lastJson = q.save;
      this.lastWrite = Date.now();
    } catch (e) {
      if (e?.code === 'unavailable') { this.queued ||= q; }
      else if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e?.code)) this.ref = null;
      else console.warn('cloud save failed', e?.code || e);
    }
    this.writing = false;
    if (this.queued) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 4000);
  },
};
