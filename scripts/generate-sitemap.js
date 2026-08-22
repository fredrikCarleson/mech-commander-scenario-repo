import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.resolve('public');
const WIKI_DIR = path.join(PUBLIC_DIR, 'wiki');
const SITEMAP_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');

const BASE_URL = 'https://meridian-strike-wiki.netlify.app';

function generateSitemap() {
  const routes = [
    { path: '/catalogue', priority: '1.0', changefreq: 'daily' },
    { path: '/campaigns', priority: '1.0', changefreq: 'daily' },
    { path: '/upload', priority: '0.8', changefreq: 'monthly' },
  ];

  // Read wiki pages
  if (fs.existsSync(WIKI_DIR)) {
    const files = fs.readdirSync(WIKI_DIR);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const pageId = file.replace('.md', '');
        routes.push({
          path: `/wiki/${pageId}`,
          priority: '0.9',
          changefreq: 'weekly',
        });
      }
    }
  }

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${BASE_URL}${route.path}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  fs.writeFileSync(SITEMAP_PATH, sitemapContent);
  console.log('✅ Generated sitemap.xml');
}

generateSitemap();
