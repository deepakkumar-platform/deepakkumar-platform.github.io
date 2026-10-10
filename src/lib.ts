import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function readingMinutes(body = ''): number {
  const words = body.replace(/<[^>]+>|import .*|[#>*_`|-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export const longDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const tagSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Tags shown on the site, most used first. Labels keep the first spelling seen.
export function allTags(posts: Post[]): { slug: string; label: string; count: number }[] {
  const map = new Map<string, { slug: string; label: string; count: number }>();
  for (const p of posts) for (const t of p.data.tags) {
    const slug = tagSlug(t);
    const e = map.get(slug) ?? { slug, label: t, count: 0 };
    e.count++;
    map.set(slug, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
