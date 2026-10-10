import raw from '../../data/outages.json';

export interface Outage {
  source: 'aws' | 'azure' | 'gcp' | 'cloudflare' | 'github';
  date: string; title: string; url: string; duration_hours: number | null;
  root_cause_quote: string; trigger: string; change_triggered: boolean | null;
  dns_involved: boolean; cert_involved: boolean; automation_involved: boolean; notes?: string;
}

export const ROWS = (raw as Outage[]).slice().sort((a, b) => b.date.localeCompare(a.date));
export const N = ROWS.length;

export const LABELS: Record<string, string> = {
  config_change: 'Config change', maintenance_op: 'Maintenance or manual step',
  hardware_facility: 'Hardware, power, fibre', code_deploy: 'Code deploy',
  latent_bug: 'Old bug, nothing changed', capacity_load: 'Traffic or capacity',
  dependency: 'Upstream dependency', attack: 'Attack or DDoS', cert_expiry: 'Expired cert', unknown: 'Not stated',
};
export const CHANGE_KEYS = new Set(['config_change', 'maintenance_op', 'code_deploy']);
export const SOURCES: Record<string, string> = { aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud', cloudflare: 'Cloudflare', github: 'GitHub' };
export const SOURCE_RULE: Record<string, string> = {
  aws: 'Every Post-Event Summary, 2011 to 2025',
  azure: 'Every final PIR in Azure status history, July 2021 to July 2026',
  gcp: 'Every incident with a stated cause, October 2024 to October 2026 (37 of 67 had none and were skipped)',
  cloudflare: "Cloudflare's own outage post-mortems, 2019 to 2026",
  github: 'Most recent consecutive incidents in the availability reports, May to August 2026',
};

const count = (f: (r: Outage) => boolean, rows = ROWS) => rows.filter(f).length;
export const pct = (a: number, b = N) => Math.round((100 * a) / b);

export const byTrigger = Object.entries(
  ROWS.reduce<Record<string, number>>((m, r) => ((m[r.trigger] = (m[r.trigger] ?? 0) + 1), m), {}),
).sort((a, b) => b[1] - a[1]);
export const tCount = (k: string) => count((r) => r.trigger === k);

export const STATS = {
  change: count((r) => r.change_triggered === true),
  known: count((r) => r.change_triggered !== null),
  hardware: tCount('hardware_facility'),
  dns: count((r) => r.dns_involved),
  cert: count((r) => r.cert_involved),
  automation: count((r) => r.automation_involved),
  unknown: tCount('unknown'),
  azure: count((r) => r.source === 'azure'),
};

export const perSource = Object.keys(SOURCES).map((s) => {
  const rs = ROWS.filter((r) => r.source === s);
  return { s, n: rs.length, change: pct(count((r) => r.change_triggered === true, rs), rs.length), hw: count((r) => r.trigger === 'hardware_facility', rs) };
});

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const durations = byTrigger
  .map(([k]) => { const xs = ROWS.filter((r) => r.trigger === k && r.duration_hours).map((r) => r.duration_hours as number); return { k, n: xs.length, med: xs.length ? median(xs) : 0 }; })
  .filter((d) => d.n >= 8)
  .sort((a, b) => b.med - a.med);

export const find = (source: string, date: string) => {
  const r = ROWS.find((x) => x.source === source && x.date === date);
  if (!r) throw new Error(`No outage row for ${source} ${date}`);
  return r;
};
