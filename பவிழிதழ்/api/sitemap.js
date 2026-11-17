const SUPABASE_URL='https://guuowevezqqscpppehcr.supabase.co';
const SUPABASE_PUBLIC_KEY='sb_publishable_HonZEhmBJBT5N34Ub3XAIg_UWZPKGkD';
const SITE='https://www.pavizhithazh.com';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
module.exports=async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).send('Method Not Allowed');}
 try{
  const url=new URL('/rest/v1/posts',SUPABASE_URL);
  url.search=new URLSearchParams({select:'id,author,created_at',published:'eq.true',order:'created_at.desc',limit:'5000'}).toString();
  const response=await fetch(url,{headers:{apikey:SUPABASE_PUBLIC_KEY,Authorization:'Bearer '+SUPABASE_PUBLIC_KEY,Accept:'application/json'}});
  if(!response.ok){console.error('Sitemap Supabase response:',response.status,await response.text());return res.status(502).send('Sitemap temporarily unavailable');}
  const posts=await response.json();
  const fixed=['/','/kavithai.html','/kathai.html','/katturai.html','/aaivukatturai.html','/kulandhai.html','/authors.html','/archives.html','/about.html','/privacy-policy.html','/terms.html','/editorial-policy.html','/originality-policy.html','/author-guidelines.html','/certificates.html'];
  const urls=new Map();
  const now=new Date().toISOString();
  fixed.forEach(path=>urls.set(SITE+path,{loc:SITE+path,lastmod:now}));
  const authors=new Set();
  (Array.isArray(posts)?posts:[]).forEach(post=>{
   const loc=SITE+'/read.html?id='+encodeURIComponent(String(post.id));
   const lastmod=post.created_at&& !Number.isNaN(Date.parse(post.created_at))?new Date(post.created_at).toISOString():now;
   urls.set(loc,{loc,lastmod});
   if(post.author)authors.add(String(post.author));
  });
  authors.forEach(author=>{const loc=SITE+'/author.html?name='+encodeURIComponent(author);urls.set(loc,{loc,lastmod:now});});
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...urls.values()].map(x=>'<url><loc>'+esc(x.loc)+'</loc><lastmod>'+esc(x.lastmod)+'</lastmod></url>').join('\n')+'\n</urlset>';
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=1800');
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).send(xml);
 }catch(error){console.error('Sitemap generation error:',error);return res.status(500).send('Sitemap temporarily unavailable');}
};
