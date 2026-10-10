import rss from '@astrojs/rss';
import { SITE } from '../config';
import { getPosts } from '../lib';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: `/${p.id}/` })),
  });
}
