const SUPABASE_URL = 'https://guuowevezqqscpppehcr.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_HonZEhmBJBT5N34Ub3XAIg_UWZPKGk';
const SITE_URL = 'https://www.pavizhithazh.com';

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function asRfc822(value) {
  const date = value ? new Date(value) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toUTCString();
}
function categoryName(value) {
  return ({kavithai:'கவிதை',kathai:'சிறுகதை',katturai:'கட்டுரை',aaivukatturai:'ஆய்வுக் கட்டுரை',kulandhai:'குழந்தை இலக்கியம்'})[value] || 'இலக்கியப் படைப்பு';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }
  try {
    const endpoint = new URL('/rest/v1/posts', SUPABASE_URL);
    endpoint.search = new URLSearchParams({
      select: 'id,title,author,category,content,display_date,created_at',
      published: 'eq.true',
      order: 'created_at.desc',
      limit: '1000'
    }).toString();
    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: 'Bearer ' + SUPABASE_PUBLIC_KEY,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('RSS Supabase response:', response.status, detail);
      return res.status(502).type('text/plain; charset=utf-8').send('RSS feed is temporarily unavailable.');
    }
    const posts = await response.json();
    const items = (Array.isArray(posts) ? posts : []).map(post => {
      const url = SITE_URL + '/read.html?id=' + encodeURIComponent(String(post.id));
      const description = String(post.content || '').replace(/\s+/g, ' ').trim().slice(0, 1600);
      const published = post.created_at || (post.display_date ? post.display_date + 'T00:00:00+05:30' : null);
      return [
        '<item>',
        '<title>' + xmlEscape(post.title || 'தலைப்பிடப்படாத படைப்பு') + '</title>',
        '<link>' + xmlEscape(url) + '</link>',
        '<guid isPermaLink="true">' + xmlEscape(url) + '</guid>',
        '<dc:creator>' + xmlEscape(post.author || 'பவிழிதழ் வாசகர்') + '</dc:creator>',
        '<category>' + xmlEscape(categoryName(post.category)) + '</category>',
        '<pubDate>' + xmlEscape(asRfc822(published)) + '</pubDate>',
        '<description>' + xmlEscape(description) + '</description>',
        '</item>'
      ].join('');
    }).join('\n');

    const feed = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>' +
      '<title>பவிழிதழ் – தமிழ் இலக்கிய இதழ்</title>' +
      '<link>' + SITE_URL + '</link>' +
      '<description>பவிழிதழில் நிர்வாகத்தால் வெளியிடப்பட்ட புதிய கவிதைகள், சிறுகதைகள், கட்டுரைகள் மற்றும் இலக்கியப் படைப்புகள்.</description>' +
      '<language>ta-IN</language>' +
      '<atom:link href="' + SITE_URL + '/feed.xml" rel="self" type="application/rss+xml"/>' +
      '<lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>' +
      items + '</channel></rss>';

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(feed);
  } catch (error) {
    console.error('RSS feed error:', error);
    return res.status(500).type('text/plain; charset=utf-8').send('RSS feed is temporarily unavailable.');
  }
};
