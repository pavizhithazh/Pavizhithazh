const fixPaviName=s=>String(s==null?'':s).replace(/[ஈஇ]ரா\.\s*பவித்ரா/g,'இரா.பவித்ரா');
/* SUPABASE DATA LAYER */
const PaviDB = (() => {
  const client = () => window.pavizhidhalSupabase;
  const fail = (error) => { if (error) { console.error('Supabase:', error); throw error; } };
  const mapPost = r => ({ id:r.id, title:r.title, author:r.author, category:r.category, content:r.content,
    authorAvatar:r.author_avatar_url || 'images/default_author.svg', image:r.image_url || '', date:r.display_date || '', createdAt:r.created_at });
  async function loadComments(){
    const {data:comments,error}=await client().from('comments').select('*').order('created_at',{ascending:true});
    if(error) throw error; const grouped={}; (comments||[]).forEach(c=>{(grouped[c.post_id] ||= []).push({id:c.id,userName:c.user_name,text:c.content,date:new Date(c.created_at).toLocaleDateString('ta-IN'),approved:c.approved});});
    Object.keys(grouped).forEach(id=>localStorage.setItem(`pavizhidhal_comments_${id}`,JSON.stringify(grouped[id])));
  }
  async function refreshPosts() {
    const db=client(); if(!db) throw new Error('Supabase client load ஆகவில்லை. இணைய இணைப்பைச் சரிபார்க்கவும்.');
    // Public pages must only cache rows explicitly marked as published.
    const {data:posts,error}=await db.from('posts').select('*').eq('published',true).order('created_at',{ascending:false});
    fail(error);
    const mapped=(posts||[]).map(mapPost);
    localStorage.setItem('pavizhidhal_posts',JSON.stringify(mapped));
    return mapped;
  }
  async function init() {
    const db=client(); if(!db) throw new Error('Supabase client load ஆகவில்லை. இணைய இணைப்பைச் சரிபார்க்கவும்.');
    await refreshPosts();
    await loadComments().catch(e=>console.warn('Comments load:',e));
    const {data:settings,error:se}=await db.from('site_settings').select('setting_key,setting_value');
    if(!se) (settings||[]).forEach(x=>{ const keys={site:'pavizhidhal_site_settings',issue:'pavizhidhal_issue_settings',social:'pavizhidhal_social',contest:'pavizhidhal_contest',winners:'pavizhidhal_winners',quarterly_issues:'pavizhidhal_quarterly_issues',semiannual_awards:'pavizhidhal_semiannual_awards',special_awards:'pavizhidhal_special_awards',annual_contests:'pavizhidhal_annual_contests',annual_anthologies:'pavizhidhal_annual_anthologies',certificates:'pavizhidhal_certificates',certificate_branding:'pavizhidhal_certificate_branding'}; if(keys[x.setting_key]) localStorage.setItem(keys[x.setting_key],JSON.stringify(x.setting_value)); });
  }
  async function savePosts(posts){
    const db=client();
    if(!Array.isArray(posts)) throw new Error('படைப்புப் பட்டியல் சரியான வடிவில் இல்லை.');
    for(const p of posts){
      const row={id:String(p.id),title:String(p.title||'').trim(),author:String(p.author||'').trim(),category:p.category,content:String(p.content||''),author_avatar_url:p.authorAvatar||null,image_url:p.image||null,display_date:p.date||null,published:true};
      const {data,error}=await db.from('posts').upsert(row,{onConflict:'id'}).select('id,published').single();
      fail(error);
      if(!data || data.published!==true) throw new Error(`“${row.title}” பதிவு Supabase-ல் வெளியிடப்பட்டதாக உறுதிப்படுத்தப்படவில்லை.`);
    }
    // Read the saved rows back from Supabase instead of trusting stale browser cache.
    await refreshPosts();
  }
  async function deletePost(id){const {error}=await client().from('posts').delete().eq('id',String(id));fail(error);}
  async function addComment(postId,userName,content){const {data,error}=await client().from('comments').insert({post_id:String(postId),user_name:userName,content,approved:false}).select().single();fail(error);return data;}
  async function deleteComment(id){const {error}=await client().from('comments').delete().eq('id',String(id));fail(error);}
  async function approveComment(id){const {error}=await client().from('comments').update({approved:true}).eq('id',String(id));fail(error);}
  async function saveSetting(key,value){const {error}=await client().from('site_settings').upsert({setting_key:key,setting_value:value,updated_at:new Date().toISOString()},{onConflict:'setting_key'});fail(error);}
  async function getWebsiteUpdatedDate(){const {data,error}=await client().from('site_settings').select('setting_value').eq('setting_key','website_updated_date').maybeSingle();fail(error);return typeof data?.setting_value==='string'?data.setting_value:'';}
  async function saveWebsiteUpdatedDate(date){await saveSetting('website_updated_date',date);return date;}
  async function upload(file,bucket){const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${Date.now()}-${Math.random().toString(36).slice(2)}-${clean}`;const {error}=await client().storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});fail(error);const {data}=client().storage.from(bucket).getPublicUrl(path);return data.publicUrl;}
  const CERTIFICATE_BUCKET='pavizhidhal-certificates';
  async function uploadCertificateFile(file){
    if(!file) throw new Error('சான்றிதழ் PDF கோப்பைத் தேர்ந்தெடுக்கவும்.');
    const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${new Date().getFullYear()}/${Date.now()}-${Math.random().toString(36).slice(2)}-${clean}`;
    const {error}=await client().storage.from(CERTIFICATE_BUCKET).upload(path,file,{upsert:false,contentType:'application/pdf',cacheControl:'3600'});
    fail(error);return path;
  }
  async function removeCertificateFile(path){if(!path)return;const {error}=await client().storage.from(CERTIFICATE_BUCKET).remove([path]);fail(error);}
  function certificatePublicUrl(path){
    if(!path)return '';
    let clean=String(path).trim();
    const marker=`/storage/v1/object/public/${CERTIFICATE_BUCKET}/`;
    const at=clean.indexOf(marker);
    if(at>=0) clean=clean.slice(at+marker.length);
    clean=clean.replace(/^\/+/, '');
    try{clean=decodeURIComponent(clean);}catch(_){}
    return client().storage.from(CERTIFICATE_BUCKET).getPublicUrl(clean).data.publicUrl;
  }
  async function listCertificateFiles(includeHidden=false){
    let query=client().from('certificates').select('id,certificate_no,recipient_name,certificate_type,event_name,work_title,category,issue_year,issued_on,file_path,file_name,is_published,created_at').order('issued_on',{ascending:false}).order('created_at',{ascending:false});
    if(!includeHidden)query=query.eq('is_published',true);
    const {data,error}=await query;fail(error);return data||[];
  }
  async function createCertificateFileRecord(row){const {data,error}=await client().from('certificates').insert(row).select().single();fail(error);return data;}
  async function setCertificatePublished(id,isPublished){const {error}=await client().from('certificates').update({is_published:!!isPublished}).eq('id',id);fail(error);}
  async function deleteCertificateFileRecord(id){const {error}=await client().from('certificates').delete().eq('id',id);fail(error);}
  async function login(email,password){const {data,error}=await client().auth.signInWithPassword({email,password});fail(error);const {data:allowed,error:ae}=await client().rpc('pavizhidhal_is_admin');if(ae || allowed!==true){await client().auth.signOut();throw new Error('இந்தக் கணக்கிற்கு Admin அனுமதி இல்லை. admin_users அட்டவணையில் user_id சேர்க்கப்பட்டுள்ளதா பார்க்கவும்.');}return data;}
  async function logout(){const {error}=await client().auth.signOut();fail(error);}
  async function isAdmin(){const {data:{session}}=await client().auth.getSession();if(!session)return false;const {data,error}=await client().rpc('pavizhidhal_is_admin');return !error && data===true;}
  return {init,refreshPosts,loadComments,savePosts,deletePost,addComment,deleteComment,approveComment,saveSetting,getWebsiteUpdatedDate,saveWebsiteUpdatedDate,upload,uploadCertificateFile,removeCertificateFile,certificatePublicUrl,listCertificateFiles,createCertificateFileRecord,setCertificatePublished,deleteCertificateFileRecord,login,logout,isAdmin};
})();

async function persistPaviSetting(localKey, value) {
  const map={
    pavizhidhal_site_settings:'site', pavizhidhal_issue_settings:'issue',
    pavizhidhal_social:'social', pavizhidhal_contest:'contest', pavizhidhal_winners:'winners',
    pavizhidhal_quarterly_issues:'quarterly_issues', pavizhidhal_semiannual_awards:'semiannual_awards',
    pavizhidhal_special_awards:'special_awards', pavizhidhal_annual_contests:'annual_contests',
    pavizhidhal_annual_anthologies:'annual_anthologies', pavizhidhal_certificates:'certificates',
    pavizhidhal_certificate_branding:'certificate_branding'
  };
  const settingKey=map[localKey];
  if(!settingKey) throw new Error('அறியப்படாத அமைப்பு வகை.');
  await PaviDB.saveSetting(settingKey,value);
  localStorage.setItem(localKey, JSON.stringify(value));
  return value;
}

function safeParseJSON(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch (error) { console.warn('பவிழிதழ் தரவு வாசிப்புப் பிழை:', error); return fallback; }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>\"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
  })[char]);
}

function initVintagePageExperience() {
  const category = document.body.getAttribute('data-category') || 'home';
  const labels = {
    home: 'பவிழிதழ் திறக்கப்படுகிறது…', kavithai: 'கவிதை ஏடு மலர்கிறது…',
    kathai: 'கதைப் பட்டயம் திறக்கிறது…', katturai: 'பழங்காகிதம் விரிகிறது…',
    aaivukatturai: 'ஆய்வேடு திறக்கிறது…', kulandhai: 'சிறுவர் ஏடு மலர்கிறது…',
    admin: 'நிர்வாகப் பதிவேடு திறக்கிறது…', authors_list: 'எழுத்தாளர் ஏடு திறக்கிறது…', author: 'எழுத்தாளர் பக்கம் திறக்கிறது…', read: 'படைப்பின் ஏடு திறக்கிறது…'
  };
  document.body.classList.add('page-loading');
  if (category === 'home') {
    const gate = document.createElement('div');
    gate.className = 'library-gate-intro';
    gate.setAttribute('role', 'status');
    gate.setAttribute('aria-label', 'பவிழிதழ் நூலகத்தின் கதவு திறக்கிறது');
    gate.innerHTML = `<div class="gate-hall"><div class="gate-arch"><div class="gate-interior"><div class="gate-bookcase"></div><div class="gate-welcome">பவிழிதழ்<small>மலரட்டும் தமிழ்</small><span class="gate-bloom">✿</span></div></div><div class="gate-door gate-door-left"><span>❧</span><b>ப</b><i>✥</i></div><div class="gate-door gate-door-right"><span>❧</span><b>விழி</b><i>✥</i></div></div><p class="gate-caption">இன்றைய விதை; நாளைய விருட்சம்…</p><button class="gate-skip" type="button">தவிர்</button></div>`;
    document.body.appendChild(gate);
    requestAnimationFrame(() => { document.body.classList.add('page-ready'); gate.classList.add('gate-opening'); });
    const openGate = () => { if (!gate.isConnected) return; gate.classList.add('gate-leaving'); document.body.classList.remove('page-loading'); window.setTimeout(() => gate.remove(), 850); };
    gate.querySelector('.gate-skip').addEventListener('click', openGate);
    window.addEventListener('load', () => window.setTimeout(openGate, 1850), { once: true });
    window.setTimeout(openGate, 3200);
    return;
  }
  const loader = document.createElement('div');
  loader.className = 'vintage-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = `<div class="loader-paper"><div class="loader-flower" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></div><div class="loader-title">பவிழிதழ்</div><div class="loader-caption">${labels[category] || labels.home}</div><div class="loader-rule"></div></div>`;
  document.body.appendChild(loader);
  requestAnimationFrame(() => document.body.classList.add('page-ready'));
  const dismiss = () => {
    if (!loader.isConnected) return;
    loader.classList.add('loader-dismiss');
    document.body.classList.remove('page-loading');
    window.setTimeout(() => loader.remove(), 650);
  };
  window.addEventListener('load', () => window.setTimeout(dismiss, 450), { once: true });
  window.setTimeout(dismiss, 2400);
}

function initPavizhidhalTheme(){
  const saved=localStorage.getItem('pavizhidhal_theme')||'light';
  document.documentElement.dataset.theme=saved;
  if(!document.getElementById('paviThemeToggle')){
    const btn=document.createElement('button');btn.id='paviThemeToggle';btn.type='button';btn.className='pavi-theme-toggle';btn.setAttribute('aria-label','தீம் மாற்று');
    btn.textContent=saved==='dark'?'☀ ஒளி நிறம்':'☾ இருள் நிறம்';document.body.appendChild(btn);
    btn.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('pavizhidhal_theme',next);btn.textContent=next==='dark'?'☀ ஒளி நிறம்':'☾ இருள் நிறம்';});
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  try { await PaviDB.init(); } catch (e) { console.error(e); }
  initVintagePageExperience();
  initPavizhidhalTheme();
  initDrawer();
  loadCustomLogo();
  const pageCategory = document.body.getAttribute('data-category');
  if(pageCategory==='admin') window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  ensureSiteTagline(pageCategory);
  injectSocialIconBar(pageCategory);
  loadSocialLinks();
  const contactForm=document.getElementById('contactForm');
  if(contactForm) contactForm.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(contactForm);const subject=`பவிழிதழ் தொடர்பு – ${fd.get('reason')||'பொதுத் தொடர்பு'}`;const body=`பெயர்: ${fd.get('name')}\nதொலைபேசி: ${fd.get('phone')||'குறிப்பிடப்படவில்லை'}\nமின்னஞ்சல்: ${fd.get('email')}\nவகை: ${fd.get('reason')}\n\nசெய்தி:\n${fd.get('message')}`;location.href=`mailto:pavizhithazh@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;});
  applySavedSiteSettings();
  renderIssueDownloadLink();
  if (pageCategory !== 'admin') { injectSubmissionNotice(); upgradePublicFooter(); showWebsiteUpdatedDate(); initVisitorStats(); }
  if (pageCategory === 'admin') {
    initAdminPanel();
  } else if (pageCategory === 'read') {
    renderReadPage();
  } else if (pageCategory === 'author') {
    loadAuthorProfile();
  } else if (pageCategory === 'authors_list') {
    loadAuthorsList();
  } else if (pageCategory === 'certificates') {
    loadPublicCertificateFiles();
  } else if (pageCategory) {
    loadCategoryPosts(pageCategory);
  }

  if (pageCategory === 'home') renderHomepageEditorial();
  loadContestsAndWinners();
});

function initDrawer() {
  const toggleBtn = document.getElementById('navToggleBtn');
  const sideDrawer = document.getElementById('sideDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const closeBtn = document.getElementById('closeDrawerBtn');

  if (toggleBtn && sideDrawer && drawerOverlay && closeBtn) {
    toggleBtn.addEventListener('click', () => {
      sideDrawer.classList.add('open');
      drawerOverlay.classList.add('active');
    });

    const closeMenu = () => {
      sideDrawer.classList.remove('open');
      drawerOverlay.classList.remove('active');
    };

    closeBtn.addEventListener('click', closeMenu);
    drawerOverlay.addEventListener('click', closeMenu);
  }
}

function loadCustomLogo() {
  const savedLogo = localStorage.getItem('pavizhidhal_custom_logo');
  if (savedLogo) {
    const logoImg = document.getElementById('siteLogo');
    if (logoImg) logoImg.src = savedLogo;
  }
}

function socialIconMarkup(key){
  const icons={
    wa:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 2 17.7L.8 23l5.4-1.4A11.8 11.8 0 1 0 20.5 3.5ZM12 21a9 9 0 0 1-4.6-1.3l-.3-.2-3.2.8.9-3.1-.2-.3A9 9 0 1 1 12 21Zm5-6.7c-.3-.2-1.7-.9-2-.9s-.5-.2-.7.2-.8.9-.9 1.1-.3.2-.6.1a7.3 7.3 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5L9 9.2c-.2-.4-.4-.3-.6-.3h-.5c-.2 0-.5.1-.7.3s-.9.9-.9 2.1 1 2.4 1.1 2.5c.1.2 1.9 2.9 4.6 4.1 2.7 1.2 2.7.8 3.2.8s1.7-.7 1.9-1.3.2-1.2.2-1.3-.1-.3-.3-.4Z"/></svg>',
    fb:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v1.9H7v3.1h2.9v8h3.7Z"/></svg>',
    insta:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.7" r="1.2"/></svg>',
    yt:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7.1a3 3 0 0 0-2.1-2.2C19 4.4 12 4.4 12 4.4s-7 0-8.9.5A3 3 0 0 0 1 7.1 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.9 3 3 0 0 0 2.1 2.2c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.2 31 31 0 0 0 .5-4.9 31 31 0 0 0-.5-4.9ZM9.7 15.7V8.3l6.2 3.7-6.2 3.7Z"/></svg>'
  };
  return icons[key]||'';
}
function safeSocialUrl(value,key){
  const raw=String(value||'').trim(); if(!raw)return '';
  let candidate=raw;
  if(key==='wa' && /^[+\d\s()-]+$/.test(raw)){const digits=raw.replace(/\D/g,'');if(digits.length<8)return '';candidate=`https://wa.me/${digits}`;}
  else if(!/^https?:\/\//i.test(candidate))candidate='https://'+candidate.replace(/^\/+/, '');
  try{
    const u=new URL(candidate);
    if(!['http:','https:'].includes(u.protocol))return '';
    const host=u.hostname.toLowerCase().replace(/^www\./,'');
    const allowed={wa:['wa.me','whatsapp.com','api.whatsapp.com','chat.whatsapp.com','web.whatsapp.com'],fb:['facebook.com','fb.watch'],insta:['instagram.com'],yt:['youtube.com','youtu.be']}[key]||[];
    return allowed.some(domain=>host===domain||host.endsWith('.'+domain))?u.href:'';
  }catch(_){return '';}
}
function injectSocialIconBar(category){
  if(category==='home'||category==='admin')return;
  const header=document.querySelector('header');if(!header||header.querySelector('.social-icon-bar'))return;
  const nav=document.createElement('nav');nav.className='social-icon-bar';nav.setAttribute('aria-label','பவிழிதழின் சமூக வலைதளங்கள்');
  const labels={wa:'WhatsApp',fb:'Facebook',insta:'Instagram',yt:'YouTube'};
  Object.entries(labels).forEach(([key,label])=>{const a=document.createElement('a');a.dataset.social=key;a.className=`social-icon-link social-${key}`;a.href='#';a.target='_blank';a.rel='noopener noreferrer';a.title=label;a.setAttribute('aria-label',label);a.innerHTML=socialIconMarkup(key);a.hidden=true;nav.appendChild(a);});
  header.appendChild(nav);
}
function loadSocialLinks(){
  const social=safeParseJSON(localStorage.getItem('pavizhidhal_social'),{})||{};
  const setLink=(el,key)=>{if(!el)return;const href=safeSocialUrl(social[key],key);if(href){el.href=href;el.hidden=false;el.target='_blank';el.rel='noopener noreferrer';}else{el.removeAttribute('href');el.hidden=true;}};
  [['footerWa','wa'],['footerFb','fb'],['footerInsta','insta'],['footerYt','yt']].forEach(([id,key])=>setLink(document.getElementById(id),key));
  document.querySelectorAll('.social-icon-link[data-social]').forEach(el=>setLink(el,el.dataset.social));
  document.querySelectorAll('.social-icon-bar').forEach(nav=>{nav.hidden=!Array.from(nav.querySelectorAll('.social-icon-link')).some(link=>!link.hidden);});
}
async function showWebsiteUpdatedDate(){
  if(document.body.dataset.category==='admin')return;
  try{
    const date=await PaviDB.getWebsiteUpdatedDate();
    if(!date)return;
    const footer=document.querySelector('footer');
    if(!footer)return;
    let element=document.getElementById('websiteUpdatedDate');
    if(!element){element=document.createElement('p');element.id='websiteUpdatedDate';element.className='website-updated-date';footer.appendChild(element);}
    element.textContent='இணையதள இறுதிப் புதுப்பிப்பு: '+new Date(date+'T00:00:00').toLocaleDateString('ta-IN',{timeZone:'Asia/Kolkata'});
  }catch(error){console.warn('இறுதிப் புதுப்பிப்பு தேதி:',error);}
}
function ensureSiteTagline(category){
  if(category==='admin')return;
  const title=document.querySelector('.site-title');
  const readerTitle=document.querySelector('.reader-header .reader-home');
  const anchor=title||readerTitle;
  if(!anchor||anchor.parentElement.querySelector('.site-tagline'))return;
  const tagline=document.createElement('small');tagline.className='site-tagline';tagline.textContent='(மலரட்டும் தமிழ்)';anchor.insertAdjacentElement('afterend',tagline);
}
function indiaDateParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const out={};parts.forEach(p=>{if(p.type!=='literal')out[p.type]=p.value;});return out;
}
async function initVisitorStats(){
  const panel=document.getElementById('visitorStatsPanel');if(!panel)return;
  const siteCounter=getSiteSettings().goatCounterCode||window.PAVIZHIDHAL_GOATCOUNTER_CODE||'';const code=String(siteCounter).trim();
  const format=(n)=>n==null?'—':String(n);
  panel.innerHTML='<div class="visitor-stat-heading"><strong>பவிழிதழ் வாசகர் வருகைகள்</strong><span>வருகைக் கணக்கு</span></div><div class="visitor-stat-grid"><div class="visitor-stat"><small>இன்றைய வருகைகள்</small><strong data-vis-today>—</strong></div><div class="visitor-stat"><small>இந்த மாத வருகைகள்</small><strong data-vis-month>—</strong></div><div class="visitor-stat"><small>இந்தக் காலாண்டு வருகைகள்</small><strong data-vis-quarter>—</strong></div></div><p class="visitor-stat-note" data-vis-note></p>';
  const note=panel.querySelector('[data-vis-note]');
  if(!code){note.textContent='வருகைக் கணக்கு நிர்வாக அமைப்பில் இணைக்கப்பட்ட பிறகு இங்கே கணக்குகள் தோன்றும்.';return;}
  if(!/^[a-z0-9-]+$/i.test(code)){note.textContent='வருகைக் கணக்கு குறியீடு சரியான வடிவில் இல்லை.';return;}
  const script=document.createElement('script');script.async=true;script.src='https://gc.zgo.at/count.js';script.dataset.goatcounter=`https://${code}.goatcounter.com/count`;document.head.appendChild(script);
  const d=indiaDateParts();const today=`${d.year}-${d.month}-${d.day}`;const monthStart=`${d.year}-${d.month}-01`;const qStartMonth=String(Math.floor((Number(d.month)-1)/3)*3+1).padStart(2,'0');const quarterStart=`${d.year}-${qStartMonth}-01`;
  const fetchCount=async(start)=>{const url=`https://${code}.goatcounter.com/counter/TOTAL.json?start=${encodeURIComponent(start)}&end=${encodeURIComponent(today)}`;const res=await fetch(url,{mode:'cors',cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();return data.count??null;};
  try{
    const [todayCount,monthCount,quarterCount]=await Promise.all([fetchCount(today),fetchCount(monthStart),fetchCount(quarterStart)]);
    panel.querySelector('[data-vis-today]').textContent=format(todayCount);panel.querySelector('[data-vis-month]').textContent=format(monthCount);panel.querySelector('[data-vis-quarter]').textContent=format(quarterCount);
    note.textContent='வெளிப்புற வருகைக் கணக்கிலிருந்து பெறப்பட்ட மதிப்புகள். புதுப்பிப்பில் சில மணிநேர தாமதம் இருக்கலாம்.';
  }catch(err){note.textContent='வருகைக் கணக்கை இப்போது பெற முடியவில்லை. GoatCounter தள அமைப்பில் பொதுக் கணக்கு அனுமதியைச் சரிபார்க்கவும்.';console.warn('Visitor stats:',err);}
}
async function downloadPublicPdf(url,filename){
  if(!url){alert('PDF இணைப்பு கிடைக்கவில்லை.');return;}
  // Open a blank tab during the original click so the fallback is not blocked by popup protection.
  const fallbackTab=window.open('about:blank','_blank');
  try{
    const response=await fetch(url,{mode:'cors',cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const blob=await response.blob();
    if(blob.type && !/pdf|octet-stream/i.test(blob.type))throw new Error('PDF கோப்பாக இல்லை.');
    if(fallbackTab)fallbackTab.close();
    const objectUrl=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=objectUrl;a.download=filename||'pavizhidhal-certificate.pdf';a.style.display='none';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),5000);
    return true;
  }catch(err){
    console.warn('PDF download fallback:',err);
    if(String(err.message||'').includes('HTTP 404')){
      if(fallbackTab)fallbackTab.close();
      return false;
    }
    if(fallbackTab)fallbackTab.close();
    console.warn('PDF unavailable; trying the saved certificate design record instead.');
    return false;
  }
}

function openGeneratedPublicCertificate(cert){
  const brand=safeParseJSON(localStorage.getItem('pavizhidhal_certificate_branding'),{})||{};
  const site=safeParseJSON(localStorage.getItem('pavizhidhal_site_settings'),{})||{};
  const type=cert.type==='selected_work'?'selection':(cert.type||'participation');
  const names={participation:'பங்கேற்புச் சான்றிதழ்',selection:'தேர்வு செய்யப்பட்ட படைப்பிற்கான சான்றிதழ்',winner:'வெற்றியாளர் சான்றிதழ்',special:'சிறப்புப் பாராட்டுச் சான்றிதழ்'};
  const bg={'participation':'certificate-participation.jpg','selection':'certificate-selection.jpg','winner':'certificate-winner.jpg','special':'certificate-special.jpg'}[type]||'certificate-participation.jpg';
  const esc=(v)=>escapeHTML(String(v??''));
  const name=String(cert.recipient||cert.recipient_name||'').trim();
  const event=String(cert.eventName||cert.event_name||'').trim();
  const work=String(cert.workTitle||cert.work_title||'').trim();
  const rank=String(cert.rank||'').trim();
  const number=String(cert.certificateNo||cert.certificate_no||'').trim();
  const issued=String(cert.issueDate||cert.issued_on||'');
  const date=issued?new Date(issued+'T00:00:00').toLocaleDateString('ta-IN'):'';
  const categoryNames={kavithai:'கவிதை',kathai:'சிறுகதை',katturai:'கட்டுரை',aaivukatturai:'ஆய்வுக் கட்டுரை',kulandhai:'குழந்தை இலக்கியம்'};
  const defaults={
    participation:`பவிழிதழ் நடத்திய ${event||'இலக்கிய நிகழ்ச்சி'}யில் ஆர்வத்துடன் பங்கேற்று, தங்களது திறமையையும் படைப்பாற்றலையும் வெளிப்படுத்திய ${name} அவர்களுக்கு இச்சான்றிதழ் மகிழ்ச்சியுடன் வழங்கப்படுகிறது.`,
    selection:`பவிழிதழ் நடத்திய ${event||'இலக்கியத் தேர்வில்'} தங்களது படைப்பு தேர்வு செய்யப்பட்ட ${name} அவர்களுக்கு இலக்கியப் பங்களிப்பைப் பாராட்டி இச்சான்றிதழ் அன்புடன் வழங்கப்படுகிறது.`,
    winner:`பவிழிதழ் நடத்திய ${event||'போட்டியில்'} ${rank||'சிறப்பிடம்'} பெற்று வெற்றியடைந்த ${name} அவர்களுக்கு அவர்களின் திறமை, முயற்சி மற்றும் சாதனையைப் பாராட்டி இச்சான்றிதழ் பெருமையுடன் வழங்கப்படுகிறது.`,
    special:`பவிழிதழ் இலக்கிய நிகழ்வில் தங்களது தனித்துவமான திறமை, படைப்பாற்றல் மற்றும் சிறப்பான பங்களிப்பைப் பாராட்டி ${name} அவர்களுக்கு இச்சிறப்புச் சான்றிதழ் வழங்கப்படுகிறது.`
  };
  const message=String(cert.message||defaults[type]||defaults.participation).replaceAll('[பெறுபவர் பெயர்]',name).replaceAll('[போட்டி / நிகழ்ச்சி பெயர்]',event).replaceAll('[பரிசு நிலை]',rank||'சிறப்பிடம்');
  const logo=brand.orgLogoImage||site.logo||'images/logo.svg';
  const founderName=fixPaviName(brand.founderName||brand.sign1Name||'நிறுவனர்');
  const founderRole=brand.founderRole||brand.sign1Role||'நிறுவனர்';
  const judgeName=brand.judgeName||'நடுவர்';
  const judgeRole=brand.judgeRole||'நடுவர்';
  const founderIsJudge=!!cert.founderIsJudge;
  const sign=(n,r,img)=>`<div class="sign"><div class="sigimg">${img?`<img src="${esc(img)}" alt="">`:''}</div><strong>${esc(n)}</strong><small>${esc(r)}</small></div>`;
  const signers=founderIsJudge?sign(founderName,'நடுவர் மற்றும் நிறுவனர்',brand.founderImage||brand.sign1Image):sign(judgeName,judgeRole,brand.judgeImage)+sign(founderName,founderRole,brand.founderImage||brand.sign1Image);
  const w=window.open('','_blank');
  if(!w){alert('சான்றிதழ் திறக்க Browser-ல் Pop-up அனுமதி வழங்கவும்.');return false;}
  const html=`<!doctype html><html lang="ta"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${esc(location.href)}"><title>${esc(names[type]||'சான்றிதழ்')} - ${esc(name)}</title><style>
  @page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Noto Serif Tamil","Latha",serif;color:#172b4d}.tools{padding:10px;text-align:center;background:#eee}.tools button{padding:10px 22px;background:#173c68;color:white;border:0;border-radius:6px;font:inherit}.sheet{width:297mm;height:210mm;margin:0 auto;background:#fff url("${esc('images/'+bg)}") center/100% 100% no-repeat;position:relative;text-align:center;padding:17mm 24mm 15mm;display:flex;flex-direction:column;align-items:center;overflow:hidden}.head{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:25mm}.logo{max-width:27mm;max-height:24mm;object-fit:contain}.brand{font-size:24px;font-weight:bold;color:#102f68}.subtitle{font-size:11px}.title{font-size:30px;color:#8a1730;margin:2mm 0 0}.type{font-size:17px;font-weight:bold;margin:0 0 2mm}.intro{font-size:14px;margin:1mm 0}.honor{font-size:10px;margin:0 0 1mm}.recipient{font-size:28px;font-weight:bold;color:#102f68;border-bottom:1px solid #a88943;padding:0 18mm 2mm;min-width:60%}.message{font-size:14px;line-height:1.65;max-width:88%;margin:4mm auto 2mm;white-space:pre-line}.details{font-size:12px;line-height:1.7}.seal{max-height:18mm;max-width:18mm;object-fit:contain;margin:2mm}.signs{margin-top:auto;width:92%;display:flex;justify-content:space-around;gap:15mm}.sign{min-width:35%;display:flex;flex-direction:column;align-items:center;font-size:11px}.sigimg{height:13mm;display:flex;align-items:end}.sigimg img{max-width:45mm;max-height:12mm;object-fit:contain}.sign strong{border-top:1px solid #333;padding-top:2mm}.sign small{font-size:10px}.serial{position:absolute;bottom:10mm;left:20mm;font-size:10px}.date{position:absolute;bottom:10mm;right:20mm;font-size:10px}@media print{.tools{display:none}.sheet{margin:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="tools"><button onclick="window.print()">PDF ஆகச் சேமிக்கவும் / அச்சிடவும்</button><p>அச்சிடும் சாளரத்தில் Destination → Save as PDF தேர்வு செய்யவும்.</p></div><main class="sheet"><header class="head"><img class="logo" src="${esc(logo)}" alt=""><div><div class="brand">${esc(brand.brandName||'பவிழிதழ்')}</div><div class="subtitle">${esc(brand.brandSubtitle||'காலாண்டு இலக்கிய இதழ்')}</div></div></header><h1 class="title">சான்றிதழ்</h1><div class="type">${esc(names[type]||names.participation)}</div><p class="intro">இதன் மூலம் சான்றளிக்கப்படுவது:</p><div class="honor">திரு. / திருமதி / செல்வி / செல்வன் / திருநம்பி / திருநங்கை / திருநர்</div><div class="recipient">${esc(name)}</div><p class="message">${esc(message)}</p><div class="details">${esc(event)}${work?'<br>படைப்பு: '+esc(work):''}${cert.category?'<br>பிரிவு: '+esc(categoryNames[cert.category]||cert.category):''}${rank?'<br><b>'+esc(rank)+'</b>':''}<br>${esc(cert.year||cert.issue_year||'')}</div>${brand.sealImage?`<img class="seal" src="${esc(brand.sealImage)}" alt="முத்திரை">`:''}<div class="signs">${signers}</div><div class="serial">சான்றிதழ் எண்: ${esc(number)}</div><div class="date">வழங்கிய நாள்: ${esc(date)}</div></main></body></html>`;
  w.document.open();w.document.write(html);w.document.close();return true;
}

function getStoredPosts() {
  const posts = safeParseJSON(localStorage.getItem('pavizhidhal_posts'), []);
  return Array.isArray(posts) ? posts : [];
}

async function savePosts(posts) {
  await PaviDB.savePosts(posts);
  localStorage.setItem('pavizhidhal_posts', JSON.stringify(posts));
}

function calculateTextStats(text) {
  if (!text) return { words: 0, lines: 0 };
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '').length;
  const words = text.trim().split(/\s+/).filter(word => word !== '').length;
  return { words, lines: lines || 1 };
}

function categoryTheme(category){
  return ({kavithai:'theme-kavithai',kathai:'theme-kathai',katturai:'theme-katturai',aaivukatturai:'theme-aaivukatturai',kulandhai:'theme-kulandhai'})[category]||'theme-kavithai';
}
function getCategoryName(category){
  return ({kavithai:'கவிதை',kathai:'சிறுகதை',katturai:'கட்டுரை',aaivukatturai:'ஆய்வுக் கட்டுரை',kulandhai:'குழந்தை இலக்கியம்'})[category]||'இலக்கியப் படைப்பு';
}
function readLink(post){return `read.html?id=${encodeURIComponent(post.id)}`;}
function loadCategoryPosts(category) {
  const container = document.getElementById('postsContainer');
  const comingSoonBox = document.getElementById('comingSoonBox');
  if (!container) return;
  const allPosts = getStoredPosts();
  const filteredPosts = category === 'home' ? allPosts : allPosts.filter(post => post.category === category);
  if (!filteredPosts.length) {
    if (comingSoonBox) comingSoonBox.style.display = 'block';
    container.innerHTML = '';
    return;
  }
  if (comingSoonBox) comingSoonBox.style.display = 'none';
  container.innerHTML = '';
  filteredPosts.forEach(post => {
    const stats=calculateTextStats(post.content);
    const article=document.createElement('article');
    article.className='post-card post-preview-card';
    const excerpt=String(post.content||'').trim().replace(/\s+/g,' ').slice(0,220);
    const img=post.image ? `<img class="post-preview-image" src="${escapeHTML(post.image)}" alt="${escapeHTML(post.title)}">` : '';
    article.innerHTML=`
      <div class="post-author-bar"><img src="${escapeHTML(post.authorAvatar||'images/default_author.svg')}" class="author-avatar" alt="${escapeHTML(post.author)}"><div><a class="author-name" href="author.html?name=${encodeURIComponent(post.author||'')}">${escapeHTML(post.author||'எழுத்தாளர்')}</a><div class="post-preview-date">${escapeHTML(post.date||'')}</div></div></div>
      <p class="work-category">${getCategoryName(post.category)}</p><h3 class="post-preview-title">${escapeHTML(post.title||'தலைப்பிடப்படாத படைப்பு')}</h3>
      <div class="post-stats">📝 சொற்கள்: ${stats.words} · 📃 வரிகள்: ${stats.lines}</div>${img}
      <p class="post-preview-excerpt">${escapeHTML(excerpt)}${String(post.content||'').length>220?'…':''}</p>
      <a class="issue-read-link" href="${readLink(post)}">முழுப் படைப்பையும் வாசிக்க ↗</a>`;
    container.appendChild(article);
  });
}

function renderReadPage(){
  const container=document.getElementById('readingContainer');
  if(!container)return;
  const id=new URLSearchParams(location.search).get('id');
  const post=getStoredPosts().find(p=>String(p.id)===String(id));
  if(!post){container.innerHTML='<div class="coming-soon-box"><h2>இந்தப் படைப்பைக் கண்டறிய முடியவில்லை.</h2><p>முகப்புப் பக்கத்திற்குச் சென்று மீண்டும் தேர்ந்தெடுக்கவும்.</p><a class="issue-read-link" href="index.html">முகப்பிற்குத் திரும்பு</a></div>';return;}
  document.title=`${post.title} – பவிழிதழ்`;
  const theme=categoryTheme(post.category);
  const image=post.image?`<img class="reading-illustration" src="${escapeHTML(post.image)}" alt="${escapeHTML(post.title)}">`:'';
  const isChildren=post.category==='kulandhai';
  const childFriends=isChildren?`<aside class="child-story-friends child-story-friends-left" aria-label="குழந்தைகளுக்கான அழகிய விலங்கு அலங்காரம்"><span title="யானை">🐘</span><span title="சிங்கம்">🦁</span></aside><aside class="child-story-friends child-story-friends-right" aria-hidden="true"><span title="புலி">🐯</span><span title="குரங்கு">🐵</span></aside>`:'';
  container.innerHTML=`<div class="reading-topline"><a href="index.html" class="issue-read-link">← முந்தைய பக்கம்</a><span>${getCategoryName(post.category)}</span></div>
    <div class="reading-stage ${isChildren?'reading-stage-kids':''}">${childFriends}<article class="reading-sheet ${theme}"><p class="reading-kicker">❧ பவிழிதழ் · ${getCategoryName(post.category)} ❧</p><h1>${escapeHTML(post.title)}</h1><p class="reading-byline">${escapeHTML(post.author||'எழுத்தாளர்')} · ${escapeHTML(post.date||'')}</p>${image}<div class="reading-body">${escapeHTML(post.content||'').replace(/\n/g,'<br>')}</div><div class="reading-signature">❧ ✦ ❧</div></article></div>
    <div class="reading-actions"><a class="issue-read-link" href="https://api.whatsapp.com/send?text=${encodeURIComponent(post.title+' – பவிழிதழ் '+location.href)}" target="_blank" rel="noopener">WhatsApp-ல் பகிர்</a><a class="issue-read-link" href="author.html?name=${encodeURIComponent(post.author||'')}">எழுத்தாளர் படைப்புகள்</a></div>
    <section class="reading-comments post-card"><h2>வாசகர் கருத்துகள்</h2><div id="comments-list-${post.id}"></div><div class="reading-comment-form"><input id="comment-user-${post.id}" placeholder="உங்கள் பெயர்"><textarea id="comment-text-${post.id}" placeholder="உங்கள் கருத்தை எழுதுங்கள்"></textarea><button class="admin-primary" onclick="addComment('${String(post.id).replace(/'/g,"\\'")}')">கருத்தைப் பதிவிடு</button></div></section>`;
  renderComments(post.id);
}

async function addComment(postId) {
  const userName = document.getElementById(`comment-user-${postId}`).value.trim();
  const text = document.getElementById(`comment-text-${postId}`).value.trim();
  if (!userName || !text) { alert('பெயர் மற்றும் கருத்தை உள்ளிடவும்.'); return; }
  try {
    const row=await PaviDB.addComment(postId,userName,text);
    const commentsKey=`pavizhidhal_comments_${postId}`;
    const existing=safeParseJSON(localStorage.getItem(commentsKey),[]);
    existing.push({id:row.id,userName,text,date:new Date(row.created_at).toLocaleDateString('ta-IN')});
    localStorage.setItem(commentsKey,JSON.stringify(existing));
    document.getElementById(`comment-user-${postId}`).value='';
    document.getElementById(`comment-text-${postId}`).value='';
    renderComments(postId);
    alert('கருத்து அனுப்பப்பட்டது. நிர்வாகி ஒப்புதல் அளித்த பிறகு பொதுவில் தோன்றும்.');
  } catch(e) { alert('கருத்தைச் சேமிக்க முடியவில்லை: '+(e.message||e)); }
}
function renderComments(postId) {
  const listContainer = document.getElementById(`comments-list-${postId}`);
  if (!listContainer) return;
  const commentsKey = `pavizhidhal_comments_${postId}`;
  const comments = safeParseJSON(localStorage.getItem(commentsKey), []);
  const isAdmin = sessionStorage.getItem('pavizhidhal_admin_logged') === 'true';
  const visibleComments = isAdmin ? comments : comments.filter(cmt=>cmt.approved===true);

  listContainer.innerHTML = visibleComments.length === 0 ? '<p style="font-size:0.85rem; color:#888;">இன்னும் வெளியிடப்பட்ட கருத்துகள் இல்லை.</p>' : '';

  visibleComments.forEach(cmt => {
    const isOwner = sessionStorage.getItem(`my_cmt_${cmt.id}`) === 'true';
    const canDelete = isOwner || isAdmin;

    const div = document.createElement('div');
    div.className = 'comment-box';
    div.innerHTML = `
      <strong>${escapeHTML(cmt.userName)}:</strong> ${escapeHTML(cmt.text)}
      <span style="font-size:0.75rem; color:#888; margin-left:8px;">(${escapeHTML(cmt.date)})</span>
      ${canDelete ? `<button class="comment-delete-btn" onclick="deleteComment('${postId}', '${cmt.id}')">நீக்கு</button>` : ''}
    `;
    listContainer.appendChild(div);
  });
}

async function deleteComment(postId, commentId) {
  if (confirm('இந்தக் கருத்தை நிச்சயமாக நீக்க வேண்டுமா?')) {
    try { await PaviDB.deleteComment(commentId); } catch(e) { alert('கருத்தை நீக்க முடியவில்லை: '+(e.message||e)); return; }
    const commentsKey=`pavizhidhal_comments_${postId}`;
    const comments=safeParseJSON(localStorage.getItem(commentsKey),[]).filter(c=>String(c.id)!==String(commentId));
    localStorage.setItem(commentsKey,JSON.stringify(comments)); renderComments(postId);
    if(document.getElementById('adminCommentsList')) renderAdminComments();
  }
}
function openAuthorPage(authorName) {
  window.location.href = `author.html?name=${authorName}`;
}

async function loadPublicCertificateFiles(){
  const list=document.getElementById('publicCertificatesList');
  const search=document.getElementById('certificateSearch');
  const typeFilter=document.getElementById('certificateTypeFilter');
  const status=document.getElementById('certificatePageStatus');
  if(!list)return;
  let records=[];
  const labels={selection:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்புகளுக்கான சான்றிதழ்',selected_work:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்புகளுக்கான சான்றிதழ்',participation:'பங்கேற்புச் சான்றிதழ்',special:'சிறப்புநிலைச் சான்றிதழ்',winner:'வெற்றியாளர் சான்றிதழ்'};
  const render=()=>{
    const term=(search?.value||'').trim().toLocaleLowerCase('ta');
    const type=typeFilter?.value||'';
    const rows=records.filter(r=>{
      const hay=[r.recipient_name,r.certificate_no,r.event_name,r.work_title,r.category,r.issue_year].join(' ').toLocaleLowerCase('ta');
      const normalizedType=r.certificate_type==='selected_work'?'selection':r.certificate_type;
      return (!term||hay.includes(term))&&(!type||normalizedType===type);
    });
    if(!rows.length){list.innerHTML='<div class="coming-soon-box"><h2>சான்றிதழ்கள் எதுவும் கிடைக்கவில்லை.</h2><p>பெயர் அல்லது சான்றிதழ் எண்ணை மாற்றிப் பார்த்து மீண்டும் தேடுங்கள்.</p></div>';return;}
    list.innerHTML=rows.map(r=>{
      const date=r.issued_on?new Date(`${r.issued_on}T00:00:00`).toLocaleDateString('ta-IN'):'—';
      const url=PaviDB.certificatePublicUrl(r.file_path);
      return `<article class="certificate-download-card"><div class="certificate-download-top"><span class="certificate-type-pill">${escapeHTML(labels[r.certificate_type]||'சான்றிதழ்')}</span><span class="certificate-number">${escapeHTML(r.certificate_no||'')}</span></div><h2>${escapeHTML(r.recipient_name||'')}</h2><p class="certificate-event">${escapeHTML(r.event_name||'')}</p>${r.work_title?`<p>படைப்பு: ${escapeHTML(r.work_title)}</p>`:''}${r.category?`<p>பிரிவு: ${escapeHTML(r.category)}</p>`:''}<p class="certificate-date">வழங்கிய நாள்: ${escapeHTML(date)}</p><button class="issue-read-link certificate-download-link" type="button" data-cert-public-download="${escapeHTML(r.id)}">சான்றிதழைப் பதிவிறக்கவும் ↓</button></article>`;
    }).join('');
    list.querySelectorAll('[data-cert-public-download]').forEach(btn=>btn.addEventListener('click',async()=>{
      const row=records.find(x=>String(x.id)===btn.dataset.certPublicDownload);if(!row)return;
      btn.disabled=true;const old=btn.textContent;btn.textContent='பதிவிறக்குகிறது…';
      const filename=`${(row.recipient_name||'pavizhidhal').replace(/[^\p{L}\p{N}-]+/gu,'-')}-${row.certificate_no||'certificate'}.pdf`;
      // Public readers use the exact same certificate renderer/templates as the Admin print/download action.
      // Prefer the saved designed record when the certificate number matches; retain uploaded-PDF fallback.
      const designedRows=safeParseJSON(localStorage.getItem('pavizhidhal_certificates'),[])||[];
      const match=row._designed||designedRows.find(x=>String(x.certificateNo||'').trim()===String(row.certificate_no||'').trim());
      if(match){
        printCertificate(match);
      }else if(row.file_path){
        const downloaded=await downloadPublicPdf(PaviDB.certificatePublicUrl(row.file_path),filename);
        if(!downloaded)alert('இந்தச் சான்றிதழின் PDF கோப்பை இப்போது பதிவிறக்க முடியவில்லை. பின்னர் மீண்டும் முயற்சிக்கவும்.');
      }else{
        alert('இந்தப் பதிவுக்கான சான்றிதழ் வடிவமைப்பு கிடைக்கவில்லை. Admin-ல் உள்ள சான்றிதழ் எண்ணைச் சரிபார்க்கவும்.');
      }
      btn.disabled=false;btn.textContent=old;
    }));
  };
  list.innerHTML='<div class="coming-soon-box">சான்றிதழ்கள் ஏற்றப்படுகின்றன…</div>';
  try{
    const uploaded=await PaviDB.listCertificateFiles(false);
    const designed=safeParseJSON(localStorage.getItem('pavizhidhal_certificates'),[])||[];
    const designedRows=designed.filter(x=>x&&x.recipient).map(x=>({
      id:'designed-'+x.id,certificate_no:x.certificateNo,recipient_name:x.recipient,
      certificate_type:x.type==='selected_work'?'selection':x.type,event_name:x.eventName,
      work_title:x.workTitle,category:x.category,issue_year:x.year,issued_on:x.issueDate,
      file_path:null,_designed:x
    }));
    const uploadedNos=new Set(uploaded.map(x=>String(x.certificate_no||'')));
    records=[...uploaded,...designedRows.filter(x=>!uploadedNos.has(String(x.certificate_no||'')))];
    if(status)status.textContent=records.length?`${records.length} சான்றிதழ்கள் கிடைத்துள்ளன.`:'இன்னும் சான்றிதழ்கள் வெளியிடப்படவில்லை.';
    render();
  }catch(err){
    list.innerHTML='<div class="coming-soon-box"><h2>சான்றிதழ் பட்டியலைத் திறக்க முடியவில்லை.</h2><p>நிர்வாகி Supabase-ல் சான்றிதழ் அட்டவணை அமைப்பை ஒருமுறை இயக்கியுள்ளாரா என்பதைச் சரிபார்க்கவும்.</p></div>';
    if(status)status.textContent='தரவுத்தள இணைப்பில் சிக்கல்: '+(err.message||err);
  }
  search?.addEventListener('input',render);
  typeFilter?.addEventListener('change',render);
}

function loadAuthorsList() {
  const container = document.getElementById('authorsContainer');
  if (!container) return;
  const posts = getStoredPosts();
  const authorsMap = {};

  posts.forEach(p => {
    if (!authorsMap[p.author]) {
      authorsMap[p.author] = { name: p.author, avatar: p.authorAvatar || 'images/default_author.svg', count: 1 };
    } else {
      authorsMap[p.author].count++;
    }
  });

  const authors = Object.values(authorsMap);
  if (authors.length === 0) {
    container.innerHTML = '<div class="coming-soon-box"><h2>எழுத்தாளர்கள் விவரம் விரைவில் பதிவேற்றப்படும்.</h2></div>';
    return;
  }

  container.innerHTML = '';
  authors.forEach(auth => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.gap = '20px';
    card.innerHTML = `
      <img src="${auth.avatar}" class="author-avatar" style="width:70px; height:70px;" onclick="openAuthorPage('${encodeURIComponent(auth.name)}')">
      <div>
        <h3 style="color:var(--primary-red); cursor:pointer;" onclick="openAuthorPage('${encodeURIComponent(auth.name)}')">${escapeHTML(auth.name)}</h3>
        <p style="color:var(--text-muted); font-size:0.9rem;">மொத்தப் படைப்புகள்: ${auth.count}</p>
        <button onclick="openAuthorPage('${encodeURIComponent(auth.name)}')" style="background:var(--primary-red); color:#fff; border:none; padding:4px 12px; border-radius:4px; margin-top:6px; cursor:pointer;">படைப்புகளைக் காண்க</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function loadAuthorProfile() {
  const urlParams = new URLSearchParams(window.location.search);
  const authorName = urlParams.get('name') || '';
  const container = document.getElementById('authorPostsContainer');
  const authorTitle = document.getElementById('authorTitle');

  if (authorTitle) authorTitle.textContent = `${authorName} அவர்களின் படைப்புத் தொகுப்பு`;

  const allPosts = getStoredPosts();
  const authorPosts = allPosts.filter(p => p.author === authorName);

  if (container && authorPosts.length > 0) {
    container.innerHTML = '';
    authorPosts.forEach(post => {
      const div = document.createElement('div');
      div.className = 'post-card';
      div.innerHTML = `
        <h3 style="color:var(--primary-red);">${escapeHTML(post.title)}</h3>
        <p class="post-stats">தேதி: ${escapeHTML(post.date)} | பிரிவு: ${escapeHTML(getCategoryName(post.category))}</p>
        <p>${escapeHTML(String(post.content||'').slice(0,180))}…</p><a class="issue-read-link" href="${readLink(post)}">முழுப் படைப்பை வாசிக்க ↗</a>
      `;
      container.appendChild(div);
    });
  } else if (container) {
    container.innerHTML = '<div class="coming-soon-box"><h2>செயல்பாட்டில் உள்ளது விரைவில் பதிவேற்றப்படும்.</h2></div>';
  }
}


function renderHomepageEditorial() {
  const posts = getStoredPosts().slice().sort((a, b) => {
    const da = Date.parse(a.createdAt || a.date || '') || 0;
    const db = Date.parse(b.createdAt || b.date || '') || 0;
    return db - da;
  });
  const month = 'காலாண்டு இலக்கிய இதழ்';
  const monthLabel = document.getElementById('issueMonthLabel');
  const issueHeading = document.getElementById('issueHeading');
  const qIssues=safeParseJSON(localStorage.getItem('pavizhidhal_quarterly_issues'),[]);
  const latestIssue=(Array.isArray(qIssues)?qIssues:[]).slice().sort((a,b)=>(b.publishDate||'').localeCompare(a.publishDate||''))[0];
  const quarterLabel=latestIssue?`${latestIssue.year} · ${latestIssue.monthName||latestIssue.monthLabel||'காலாண்டு'} இதழ்`:'மார்ச் · ஜூன் · செப்டம்பர் · டிசம்பர்';
  if (monthLabel) monthLabel.textContent = quarterLabel;
  if (issueHeading) issueHeading.textContent = `காலாண்டு இலக்கிய இதழ் – பவிழிதழ்`;
  const quarterPdf=document.getElementById('issuePdfDownload');
  if(quarterPdf){if(latestIssue&&latestIssue.pdfUrl){quarterPdf.href=latestIssue.pdfUrl;quarterPdf.target='_blank';quarterPdf.rel='noopener';quarterPdf.textContent='காலாண்டு இதழ் PDF-ஐப் படிக்க / பதிவிறக்க ↓';quarterPdf.hidden=false;}else if(!latestIssue){quarterPdf.hidden=true;}}

  const categoryNames = {
    kavithai: 'கவிதை', kathai: 'சிறுகதை', katturai: 'கட்டுரை',
    aaivukatturai: 'ஆய்வுக் கட்டுரை', kulandhai: 'குழந்தை இலக்கியம்'
  };
  const categoryLinks = {
    kavithai: 'kavithai.html', kathai: 'kathai.html', katturai: 'katturai.html',
    aaivukatturai: 'aaivukatturai.html', kulandhai: 'kulandhai.html'
  };
  const excerpt = value => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > 145 ? `${text.slice(0, 145)}…` : text;
  };
  const featuredGrid = document.getElementById('featuredWorksGrid');
  const newWorksList = document.getElementById('newWorksList');
  const authorCard = document.getElementById('authorOfMonthCard');
  const empty = '<div class="editorial-empty">இன்னும் படைப்புகள் வெளியிடப்படவில்லை. விரைவில் பவிழிதழில் புதிய இலக்கிய மலர்கள் மலரும்.</div>';

  const issueSettings = safeParseJSON(localStorage.getItem('pavizhidhal_issue_settings'), {});
  const selectedIds = (latestIssue && Array.isArray(latestIssue.featuredPostIds) && latestIssue.featuredPostIds.length) ? latestIssue.featuredPostIds : (Array.isArray(issueSettings.featuredIds) ? issueSettings.featuredIds : []);
  const featuredPosts = selectedIds.length ? selectedIds.map(id => posts.find(post => post.id === id)).filter(Boolean).slice(0,3) : posts.slice(0,3);
  if (featuredGrid) {
    featuredGrid.innerHTML = featuredPosts.length ? featuredPosts.map((post, index) => `
      <article class="featured-work-card featured-work-${index + 1}">
        <span class="featured-number">0${index + 1}</span>
        <p class="work-category">${escapeHTML(categoryNames[post.category] || 'இலக்கியப் படைப்பு')}</p>
        <h3>${escapeHTML(post.title || 'தலைப்பிடப்படாத படைப்பு')}</h3>
        <p class="work-excerpt">${escapeHTML(excerpt(post.content))}</p>
        <div class="work-meta"><span>${escapeHTML(post.author || 'பெயர் குறிப்பிடப்படவில்லை')}</span><span>${escapeHTML(post.date || '')}</span></div>
        <a href="${readLink(post)}" class="work-read-link">படைப்பைப் படிக்க <span>❧</span></a>
      </article>`).join('') : empty;
  }

  if (newWorksList) {
    newWorksList.innerHTML = posts.length ? posts.slice(0, 5).map(post => `
      <a class="new-work-row" href="${readLink(post)}">
        <span class="new-work-mark">❧</span>
        <span class="new-work-main"><strong>${escapeHTML(post.title || 'தலைப்பிடப்படாத படைப்பு')}</strong><small>${escapeHTML(categoryNames[post.category] || 'இலக்கியப் படைப்பு')} · ${escapeHTML(post.author || 'எழுத்தாளர்')}</small></span>
        <span class="new-work-date">${escapeHTML(post.date || '')}</span>
        <span class="new-work-arrow">↗</span>
      </a>`).join('') : empty;
  }

  if (authorCard) {
    const savedAwards = getSettingCollection('pavizhidhal_semiannual_awards').slice().sort((a,b) => Number(b.year||0)-Number(a.year||0) || (b.period==='second'?1:0)-(a.period==='second'?1:0));
    const officialAward = savedAwards[0];
    const manualName = String(issueSettings.authorName || '').trim();
    const winnerName = officialAward?.winner || manualName;
    if (winnerName) {
      const sample = posts.find(post => post.author === winnerName);
      const avatar = sample?.authorAvatar || 'images/default_author.svg';
      const awardTitle = officialAward?.awardTitle || 'அரையாண்டுச் சிறப்புப் படைப்பாளர்';
      const awardPeriod = officialAward ? `${officialAward.year} · ${officialAward.periodLabel}` : 'அரையாண்டுச் சிறப்புப் படைப்பாளர்';
      const detail = officialAward ? [officialAward.bio, officialAward.certificate, officialAward.prize].filter(Boolean).join(' · ') : (issueSettings.authorBio || 'பவிழிதழின் அரையாண்டுச் சிறப்புப் படைப்பாளர்.');
      authorCard.innerHTML = `<div class="author-month-ornament">✿</div><div class="author-month-copy"><p class="section-eyebrow">✦ ${escapeHTML(awardPeriod)} ✦</p><h2>${escapeHTML(winnerName)}</h2><p><strong>${escapeHTML(awardTitle)}</strong></p><p>${escapeHTML(detail)}</p><a href="author.html?name=${encodeURIComponent(winnerName)}" class="issue-read-link">எழுத்தாளர் பக்கத்தைப் பார்க்க ↗</a></div><img class="author-month-avatar" src="${escapeHTML(avatar)}" alt="${escapeHTML(winnerName)}">`;
    } else {
      authorCard.innerHTML = '<div class="author-month-empty"><p class="section-eyebrow">✦ அரையாண்டுச் சிறந்த எழுத்தாளர் விருது ✦</p><h2>அடுத்த சிறந்த எழுத்தாளர் தேர்வுக்காகக் காத்திருக்கிறோம்</h2><p>விருது அறிவிக்கப்பட்டதும் அதன் விவரம் இங்கே இடம்பெறும்.</p></div>';
    }
  }
  const coverTitle = document.querySelector('.issue-cover h2');
  const coverSubtitle = document.querySelector('.cover-subtitle');
  if (coverTitle && (latestIssue?.coverTitle || issueSettings.coverTitle)) coverTitle.textContent = latestIssue?.coverTitle || issueSettings.coverTitle;
  if (coverSubtitle && (latestIssue?.coverSubtitle || issueSettings.coverSubtitle)) coverSubtitle.textContent = latestIssue?.coverSubtitle || issueSettings.coverSubtitle;

}

function loadContestsAndWinners() {
  const contestSection = document.getElementById('contestSection');
  const winnersSection = document.getElementById('winnersSection');
  const contestArea = document.getElementById('contestAnnouncementArea');
  const winnersArea = document.getElementById('winnersArea');

  const contestData = safeParseJSON(localStorage.getItem('pavizhidhal_contest'), null);
  if (contestData && contestArea) {
    if (contestSection) contestSection.style.display = 'block';
    contestArea.innerHTML = `
      <div class="contest-card">
        <h3 style="color:var(--primary-red);">${escapeHTML(contestData.title)}</h3>
        <p><strong>ஆரம்ப தேதி:</strong> ${escapeHTML(contestData.startDate)} | <strong>இறுதி தேதி:</strong> ${escapeHTML(contestData.endDate)}</p>
        <p>${escapeHTML(contestData.details)}</p>
        ${contestData.image ? `<img src="${escapeHTML(contestData.image)}" class="contest-img">` : ''}
      </div>
    `;
  } else if (contestSection) {
    contestSection.style.display = 'none';
  }

  const winnerData = safeParseJSON(localStorage.getItem('pavizhidhal_winners'), null);
  if (winnerData && winnersArea) {
    if (winnersSection) winnersSection.style.display = 'block';
    winnersArea.innerHTML = `
      <div class="winner-card">
        <h3 style="color:var(--primary-red);">🏆 ${escapeHTML(winnerData.title)}</h3>
        <p><strong>வெற்றியாளர்:</strong> ${escapeHTML(winnerData.name)}</p>
        <p>${escapeHTML(winnerData.message)}</p>
      </div>
    `;
  } else if (winnersSection) {
    winnersSection.style.display = 'none';
  }
  const renderCollection=(key,selector,heading,mapper)=>{
    const el=document.querySelector(selector); if(!el)return;
    const rows=safeParseJSON(localStorage.getItem(key),[]); if(!Array.isArray(rows)||!rows.length){el.innerHTML='';return;}
    el.innerHTML=`<div class="program-list"><h2 class="page-heading">${heading}</h2>${rows.map(mapper).join('')}</div>`;
  };
  renderCollection('pavizhidhal_annual_contests','#annualContestsArea','ஆண்டு இலக்கியப் போட்டிகள்',x=>`<article class="program-card"><h3>${escapeHTML(x.title)}</h3><p>${escapeHTML(getCategoryName(x.category))} · ${escapeHTML(x.year)}</p><p>${escapeHTML(x.rules||'')}</p><p><strong>பரிசுகள்:</strong> ${escapeHTML(x.prizes||'சான்றிதழ் மற்றும் சிறப்புப் பரிசுகள்')}</p><p>${escapeHTML(x.startDate||'')} – ${escapeHTML(x.endDate||'')}</p>${x.winner?`<p><strong>வெற்றியாளர்:</strong> ${escapeHTML(x.winner)}</p><p>${escapeHTML(x.winnerMessage||'')}</p>`:''}</article>`);
  renderCollection('pavizhidhal_semiannual_awards','#semiannualAwardsArea','அரையாண்டு சிறந்த எழுத்தாளர் விருதுகள்',x=>`<article class="program-card"><h3>🏆 ${escapeHTML(x.awardTitle||'சிறந்த எழுத்தாளர் விருது')}</h3><p><strong>${escapeHTML(x.winner||'')}</strong> · ${escapeHTML(x.year||'')} · ${escapeHTML(x.periodLabel||'')}</p><p>${escapeHTML(x.bio||'')}</p><p><strong>சான்றிதழ்:</strong> ${escapeHTML(x.certificate||'சிறப்புச் சான்றிதழ்')} · <strong>பரிசு:</strong> ${escapeHTML(x.prize||'')}</p></article>`);
  renderCollection('pavizhidhal_special_awards','#specialAwardsArea','சிறப்பு இலக்கிய விருதுகள்',x=>`<article class="program-card"><h3>✦ ${escapeHTML(x.awardType||'சிறப்பு விருது')}</h3><p><strong>${escapeHTML(x.person||'')}</strong> · ${escapeHTML(x.year||'')}</p><p>${escapeHTML(x.description||'')}</p><p>${escapeHTML(x.recognition||'')}</p></article>`);
  renderCollection('pavizhidhal_annual_anthologies','#annualAnthologiesArea','ஆண்டுச் சிறப்புத் தொகுப்பு நூல்கள்',x=>`<article class="program-card"><h3>📚 ${escapeHTML(x.title||'ஆண்டுத் தொகுப்பு')}</h3><p>${escapeHTML(x.year||'')}</p><p>${escapeHTML(x.description||'')}</p>${x.pdfUrl?`<a class="issue-read-link" href="${escapeHTML(x.pdfUrl)}" target="_blank" rel="noopener">தொகுப்பு நூலை வாசிக்க ↗</a>`:''}</article>`);
}

/* ADMIN MANAGEMENT — authenticated Supabase-backed editorial tools */
async function adminReadFile(file, bucket='site-images') {
  if (!file) return '';
  if (!window.pavizhidhalSupabase) throw new Error('Supabase இணைப்பு கிடைக்கவில்லை.');
  return await PaviDB.upload(file,bucket);
}
function getSiteSettings(){ return safeParseJSON(localStorage.getItem('pavizhidhal_site_settings'), {}); }
function getSettingCollection(localKey){const v=safeParseJSON(localStorage.getItem(localKey),[]);return Array.isArray(v)?v:[];}
function applySavedSiteSettings(){
  const s=getSiteSettings();
  if(document.body.getAttribute('data-category')!=='admin'&&(s.issnNumber||s.udyamNumber||s.issnLogo||s.udyamLogo)&&!document.getElementById('paviRegistrationStrip')){const strip=document.createElement('div');strip.id='paviRegistrationStrip';strip.className='pavi-registration-strip';strip.innerHTML=`${s.issnLogo?`<img src="${escapeHTML(s.issnLogo)}" alt="ISSN">`:''}${s.issnNumber?`<span>ISSN: ${escapeHTML(s.issnNumber)}</span>`:''}${s.udyamLogo?`<img src="${escapeHTML(s.udyamLogo)}" alt="Udyam MSME">`:''}${s.udyamNumber?`<span>Udyam / MSME: ${escapeHTML(s.udyamNumber)}</span>`:''}`;document.body.insertBefore(strip,document.body.firstChild); }
  if(s.siteTitle){document.querySelectorAll('.site-title').forEach(el=>el.textContent=s.siteTitle);document.title=document.title.replace('பவிழிதழ்',s.siteTitle);}
  if(s.logo){const logo=document.getElementById('siteLogo');if(logo)logo.src=s.logo;}
  if(s.primaryColor)document.documentElement.style.setProperty('--primary-red',s.primaryColor);
  if(s.goldColor)document.documentElement.style.setProperty('--gold-accent',s.goldColor);
  const k=document.querySelector('.kural-box'); if(k&&s.kural) k.textContent=s.kural;
  const n=document.querySelector('.issue-notice'); if(n&&s.notice) n.textContent=s.notice;
  const f=document.querySelector('footer'); if(f){const founder=f.querySelector('p strong'); if(founder&&s.founder) founder.parentElement.textContent=s.founder; const email=f.querySelector('a[href^="mailto:"]'); if(email&&document.body.getAttribute('data-category')==='about'){email.href='mailto:pavizhithazh@gmail.com';email.textContent='pavizhithazh@gmail.com';} const footerCopy=f.querySelector('p:nth-last-child(2)'); if(footerCopy&&s.footer) footerCopy.textContent=s.footer;}
  const category=document.body.getAttribute('data-category'); const pages=s.pages||{}; const cfg=pages[category];
  if(cfg){const main=document.querySelector('main');const heading=main&&main.querySelector('.page-heading');if(heading&&cfg.title)heading.textContent=cfg.title;let intro=main&&main.querySelector('.page-custom-intro');if(!intro&&main&&cfg.intro){intro=document.createElement('p');intro.className='page-custom-intro';heading?heading.insertAdjacentElement('afterend',intro):main.prepend(intro);}if(intro)intro.textContent=cfg.intro;}
  if(category==='home'&&pages.home){const hero=document.querySelector('.library-copy h2');const para=document.querySelector('.library-copy>p:not(.library-eyebrow)');if(hero&&pages.home.title&&!/பழைய நூலகம்|அறிவின் பழைய/.test(pages.home.title))hero.textContent=pages.home.title;if(para&&pages.home.intro&&!/மார்ச், ஜூன், செப்டம்பர், டிசம்பர் மாதங்களில் மலரும் தமிழ் இலக்கியப் படைப்புகளின் சங்கமம்/.test(pages.home.intro))para.textContent=pages.home.intro;}
}
function renderIssueDownloadLink(){
 const issues=getSettingCollection('pavizhidhal_quarterly_issues').slice().sort((a,b)=>(b.publishDate||'').localeCompare(a.publishDate||''));
 const latest=issues[0]; const intro=document.querySelector('.issue-intro'); if(!intro)return;
 let link=document.getElementById('issuePdfDownload'); if(!link){link=document.createElement('a');link.id='issuePdfDownload';link.className='issue-read-link';link.style.marginLeft='10px';intro.appendChild(link);}
 if(latest&&latest.pdfUrl){link.href=latest.pdfUrl;link.target='_blank';link.rel='noopener';link.textContent='காலாண்டு இதழ் PDF-ஐ வாசிக்க / பதிவிறக்க ↓';link.hidden=false;}else link.hidden=true;
}
function quarterMonthName(month){return ({3:'மார்ச்',6:'ஜூன்',9:'செப்டம்பர்',12:'டிசம்பர்'})[Number(month)]||'காலாண்டு';}
function lastSundayOfMonth(year,month){const d=new Date(Number(year),Number(month),0);d.setDate(d.getDate()-d.getDay());const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function formatTaDate(dateString){if(!dateString)return '';const d=new Date(`${dateString}T00:00:00`);return new Intl.DateTimeFormat('ta-IN',{day:'numeric',month:'long',year:'numeric'}).format(d);}
function makeId(prefix){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;}
function pavizhidhalLocalDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function renderAdminCollection(listId,rows,kind,editFn,deleteFn){
 const box=document.getElementById(listId);if(!box)return;
 if(!rows.length){box.innerHTML='<div class="post-card admin-empty">இன்னும் பதிவுகள் இல்லை.</div>';return;}
 box.innerHTML='';rows.forEach(row=>{
   const item=document.createElement('article');item.className='post-card admin-post-row';
   const title=document.createElement('h3');title.textContent=row.title||row.awardTitle||row.awardType||row.person||'பதிவு';
   const detail=document.createElement('p');detail.textContent=row.summary||[row.year,row.monthName,row.winner,row.person,row.periodLabel].filter(Boolean).join(' · ');
   const actions=document.createElement('div');actions.className='admin-actions';
   if(kind==='quarter') { const print=document.createElement('button');print.type='button';print.className='admin-primary';print.textContent='இதழைத் தொகுத்து அச்சிடு';print.onclick=()=>window.open(`issue-print.html?id=${encodeURIComponent(row.id)}`,'_blank');actions.appendChild(print); }
   if(kind==='certificate') { const print=document.createElement('button');print.type='button';print.className='admin-primary';print.textContent='சான்றிதழ் அச்சிடு / PDF';print.onclick=()=>printCertificate(row);actions.appendChild(print); }
   const edit=document.createElement('button');edit.type='button';edit.className='admin-secondary';edit.textContent='திருத்து';edit.onclick=()=>editFn(row);
   const del=document.createElement('button');del.type='button';del.className='admin-danger';del.textContent='நீக்கு';del.onclick=()=>deleteFn(row.id);
   actions.append(edit,del);item.append(title,detail,actions);box.appendChild(item);
 });
}
function printCertificate(cert){
 const types={selection:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்புகளுக்கான சான்றிதழ்',selected_work:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்புகளுக்கான சான்றிதழ்',participation:'பங்கேற்புச் சான்றிதழ்',special:'சிறப்புநிலைச் சான்றிதழ்',winner:'வெற்றியாளர் சான்றிதழ்'};
 const categories={kavithai:'கவிதை',kathai:'சிறுகதை',katturai:'கட்டுரை',aaivukatturai:'ஆய்வுக் கட்டுரை',kulandhai:'குழந்தை இலக்கியம்'};
 const date=cert.issueDate?new Intl.DateTimeFormat('ta-IN',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${cert.issueDate}T00:00:00`)):'';
 const brand=safeParseJSON(localStorage.getItem('pavizhidhal_certificate_branding'),{})||{};
 const founderImage=brand.founderImage||brand.sign1Image||'';
 const founderName=fixPaviName(brand.founderName||brand.sign1Name||'கவிஞர், எழுத்தாளர் செல்வி இரா.பவித்ரா');
 const founderRole=brand.founderRole||brand.sign1Role||'நிறுவனர்';
 const founderIsJudge=!!cert.founderIsJudge;
 if(!founderImage){alert('சான்றிதழ் உருவாக்குவதற்கு முன் Admin → சான்றிதழ் வடிவமைப்பு பகுதியில் நிறுவனரின் கட்டாயக் கையொப்பத்தைப் பதிவேற்றவும்.');return;}
 if(!founderIsJudge&&(!brand.judgeImage||!brand.judgeName)){alert('சான்றிதழ் உருவாக்குவதற்கு முன் நடுவரின் கட்டாயப் பெயர் மற்றும் கையொப்பத்தை Admin பகுதியில் பதிவேற்றவும். நிறுவனரே நடுவர் என்றால் அந்த விருப்பத்தைத் தேர்வு செய்யலாம்.');return;}
 if(cert.includeCoordinator&&(!brand.coordinatorImage||!brand.coordinatorName)){alert('ஒருங்கிணைப்பாளர் கையொப்பத்தைச் சேர்க்கத் தேர்வு செய்துள்ளீர்கள். அவருடைய பெயர் மற்றும் கையொப்பப் படத்தை முதலில் Admin பகுதியில் பதிவேற்றவும்.');return;}
 const win=window.open('','_blank');
 if(!win){alert('சான்றிதழ் அச்சிடும் சாளரம் திறக்கப்படவில்லை. Browser-ல் Pop-up அனுமதியை வழங்கவும்.');return;}
 const esc=escapeHTML;
 const signBlock=(name,role,image)=>`<section class="sign-block"><div class="sign-image-slot"><img class="signature-image" src="${esc(image)}" alt="${esc(role||'கையொப்பம்')}"></div><div class="sign-line"></div><strong>${esc(name||'')}</strong><small>${esc(role||'')}</small></section>`;
 const signers=[];
 if(founderIsJudge)signers.push(signBlock(founderName,'நடுவர் மற்றும் நிறுவனர்',founderImage));
 else {signers.push(signBlock(brand.judgeName,brand.judgeRole||'நடுவர்',brand.judgeImage));signers.push(signBlock(founderName,founderRole,founderImage));}
 if(cert.includeCoordinator&&brand.coordinatorImage)signers.push(signBlock(brand.coordinatorName,brand.coordinatorRole||'ஒருங்கிணைப்பாளர்',brand.coordinatorImage));
 if(cert.includePartner&&brand.partnerSignatureImage&&brand.partnerSignName)signers.push(signBlock(brand.partnerSignName,brand.partnerSignRole||'கூட்டாண்மை நிறுவனப் பிரதிநிதி',brand.partnerSignatureImage));
 const normalizedType=cert.type==='selected_work'?'selection':cert.type;
 const theme=({selection:'selection',participation:'participation',special:'special',winner:'winner'})[normalizedType]||'participation';
 const mode=brand.logoMode||'pavi';
 const siteLogo=safeParseJSON(localStorage.getItem('pavizhidhal_site_settings'),{}).logo||'images/logo.svg';
 const ownLogo=brand.orgLogoImage||siteLogo;
 const showOwn=mode==='pavi'||mode==='both'||(mode==='partner'&&!cert.includePartner);
 const showPartner=!!cert.includePartner&&(mode==='partner'||mode==='both')&&!!brand.partnerLogoImage;
 const logoMarkup=`<div class="logo-row">${showOwn?`<img class="org-logo" src="${esc(ownLogo)}" alt="${esc(brand.brandName||'பவிழிதழ்')} லோகோ">`:''}${showPartner?`<div class="partner-logo-wrap"><img class="partner-logo" src="${esc(brand.partnerLogoImage)}" alt="கூட்டாண்மை நிறுவன லோகோ"><small>${esc(brand.partnerOrgName||'கூட்டாண்மை நிறுவனம்')}</small></div>`:''}</div>`;
 const seal=brand.sealImage?`<img class="seal-image" src="${esc(brand.sealImage)}" alt="பவிழிதழ் முத்திரை">`:`<div class="seal-placeholder"><b>பவிழிதழ்</b><i>✦</i><small>அதிகாரப்பூர்வ முத்திரை</small></div>`;
 const partnerSeal=(cert.includePartner&&brand.partnerSealImage)?`<img class="seal-image partner-seal" src="${esc(brand.partnerSealImage)}" alt="கூட்டாண்மை நிறுவன முத்திரை">`:'';
 const issnRaw=String(brand.issnNumber||'').replace(/-/g,'').toUpperCase();
 const issn=(brand.issnStatus==='assigned'&&issnRaw.length===8)?`<span>ISSN: ${esc(issnRaw.slice(0,4)+'-'+issnRaw.slice(4))} (${brand.issnMedium==='print'?'அச்சு':'இணையம்'})</span>`:'';
 const udyam=(brand.udyamStatus==='registered'&&brand.udyamNumber)?`<span>Udyam Registration No.: ${esc(brand.udyamNumber)}</span>`:'';
 const registry=(issn||udyam)?`<div class="registry-strip">${issn}${udyam}</div>`:'';
 const recipient=String(cert.recipient||'').trim();
 const themeLabels={selection:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்பு · இலக்கிய அங்கீகாரம்',participation:'பங்கேற்பு · இலக்கியப் பயணம்',special:'சிறப்புநிலை · பாராட்டுச் சிறப்பு',winner:'வெற்றி · சிறந்த சாதனை'};
 const markup=`<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${esc(location.href)}"><title>${esc(types[cert.type]||'சான்றிதழ்')} – ${esc(recipient)}</title><style>
@page{size:A4 landscape;margin:7mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;min-height:100%;background:#eee8da;color:#493222;font-family:"Noto Serif Tamil","Latha",serif}
.toolbar{height:14mm;display:flex;align-items:center;justify-content:center;padding:2mm}
.toolbar button{padding:7px 20px;background:#632b28;color:#fff3d7;border:1px solid #b18a50;border-radius:4px;font:inherit;cursor:pointer}
.certificate{--main:#76552d;--accent:#c49b52;--soft:#fff7e5;position:relative;width:283mm;height:196mm;margin:0 auto 10px;padding:0;overflow:hidden;text-align:center;background-color:#fff;background-repeat:no-repeat;background-position:center;background-size:100% 100%;border:0;outline:0;display:block;isolation:isolate}
.certificate.theme-selection{background-image:url('images/certificate-selection.jpg')!important}
.certificate.theme-participation{background-image:url('images/certificate-participation.jpg')!important}
.certificate.theme-special{background-image:url('images/certificate-special.jpg')!important}
.certificate.theme-winner{background-image:url('images/certificate-winner.jpg')!important}
.certificate:before,.certificate:after,.corner{display:none!important;content:none!important}
/* Each design is a single full-page artwork. All variable content stays inside its own printed frame. */
.certificate{position:relative;width:283mm;height:196mm;margin:0 auto 10px;padding:0;overflow:hidden;text-align:center;background-color:#fff;background-repeat:no-repeat;background-position:center;background-size:100% 100%;border:0;outline:0;display:block;isolation:isolate}
.certificate.theme-selection{background-image:url('images/certificate-selection-template.jpg')!important}
.certificate.theme-participation{background-image:url('images/certificate-participation-template.jpg')!important}
.certificate.theme-winner{background-image:url('images/certificate-winner-template.jpg')!important}
.certificate.theme-special{background-image:url('images/certificate-special-template.jpg')!important}
.certificate:before,.certificate:after,.corner{display:none!important;content:none!important}
.inner-content{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;text-align:center;min-width:0;min-height:0;color:#493222}
/* Blue frame */
.theme-selection .inner-content{left:4.3%;right:4.1%;top:4.5%;bottom:4.5%;padding:2.2% 3.2% 1.8%}
/* Dark plum and gold frame */
.theme-participation .inner-content{left:8.4%;right:8.4%;top:22%;bottom:17%;padding:1.2% 2.5% 1.2%}
/* Antique parchment frame */
.theme-winner .inner-content{left:3.2%;right:3.2%;top:4.5%;bottom:4.5%;padding:1.4% 3% 1.2%}
/* Gold ornate frame */
.theme-special .inner-content{left:8.2%;right:8.2%;top:12.5%;bottom:12%;padding:1.5% 3% 1.2%}
.brand-head{position:relative;width:100%;min-height:0!important;height:auto;flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:2.5%;margin:0 0 1.1% 0!important;padding:0;}
.logo-row{display:flex;align-items:center;justify-content:center;gap:2mm;min-width:0;flex:0 1 auto;max-width:34%}
.org-logo{max-width:15mm;max-height:13mm;object-fit:contain}
.partner-logo-wrap{display:flex;flex-direction:column;align-items:center;gap:.5mm;min-width:0;max-width:17mm}
.partner-logo{max-width:13mm;max-height:11mm;object-fit:contain}
.partner-logo-wrap small{font-size:5.5pt;color:var(--main);max-width:22mm;overflow-wrap:anywhere}
.brand-head>div:nth-child(2){text-align:center;min-width:0;max-width:55%;}
.brand-center{font-size:16pt;line-height:1.15;letter-spacing:.2px;color:var(--main);font-weight:800;text-shadow:none;white-space:normal;overflow-wrap:anywhere}
.subtitle{font-size:7pt;line-height:1.2;color:var(--main);margin-top:.8mm;text-shadow:none;letter-spacing:.1px}
.partner-heading{position:absolute;right:0;top:0;max-width:22%;font-size:6pt;color:var(--main);text-align:right;line-height:1.2;overflow-wrap:anywhere}
.title{position:relative;flex:0 0 auto;font-size:23pt;line-height:1.12;color:var(--main);margin:0 0 .6% 0!important;text-shadow:none}
.type{position:relative;flex:0 0 auto;font-size:11pt;line-height:1.2;color:var(--accent);font-weight:bold;margin:0 0 .7% 0!important}
.level-tag{position:relative;left:auto;top:auto;transform:none;max-width:85%;font-size:6.5pt;line-height:1.15;color:var(--main);border:1px solid var(--accent);border-radius:99px;padding:1mm 5mm;margin:0 0 .8%;white-space:normal}
.intro{position:relative;left:auto;right:auto;top:auto;flex:0 0 auto;font-size:8.5pt;line-height:1.15;margin:0 0 .4% 0}
.honorific-line{position:relative;left:auto;right:auto;top:auto;flex:0 0 auto;font-size:6.2pt;line-height:1.1;letter-spacing:.05px;color:#604b32;margin:0 0 .3%!important}
.recipient{position:relative;left:auto;right:auto;top:auto;flex:0 0 auto;min-width:0;width:86%;margin:0!important;padding:0 2mm .8mm;font-size:19pt;line-height:1.15;font-weight:bold;color:var(--main);border-bottom:1px solid var(--accent);overflow-wrap:anywhere}
.message{position:relative;left:auto;right:auto;top:auto;flex:0 1 auto;width:84%;max-height:20%;overflow:hidden;font-size:8.3pt;line-height:1.3;white-space:pre-line;margin:1.2% auto .5%!important}
.details{position:relative;left:auto;right:auto;top:auto;flex:0 0 auto;max-height:16%;overflow:hidden;width:86%;font-size:7.2pt;line-height:1.25;color:#493222;margin:0 0 .5% 0!important}
.rank{font-weight:bold;color:var(--main);font-size:8.5pt}
.seal-row{position:relative;left:auto;right:auto;top:auto;bottom:auto;flex:0 0 auto;min-height:10mm;height:10mm;display:flex;justify-content:center;align-items:center;gap:5mm;margin:.2% 0 .4%}
.seal-image{width:10mm;height:10mm;object-fit:contain}
.partner-seal{width:9mm;height:9mm}
.seal-placeholder{height:10mm;width:10mm;border:2px double var(--main);border-radius:50%;color:var(--main);display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,.28);outline:1px dashed var(--accent);outline-offset:-1.5mm}
.seal-placeholder b{font-size:5pt}.seal-placeholder i{font-size:7pt;font-style:normal;line-height:1}.seal-placeholder small{font-size:3pt;max-width:8mm;line-height:1}
.signature-area{position:relative;left:auto;right:auto;top:auto;bottom:auto;flex:0 0 auto;width:90%;min-height:12mm;display:grid;grid-template-columns:repeat(var(--sign-count),minmax(0,1fr));align-items:end;gap:3mm;margin:1.4% 0 0;padding-top:.3%}
.sign-block{min-width:0;text-align:center;font-size:6.5pt;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;line-height:1.1}
.sign-image-slot{height:6mm;width:100%;display:flex;align-items:end;justify-content:center}
.signature-image{max-height:5.5mm;max-width:60%;object-fit:contain}
.sign-line{width:72%;border-top:1px solid var(--main);margin:.8mm 0}
.sign-block strong{font-size:6.5pt;color:var(--main);white-space:normal;overflow-wrap:anywhere;max-width:100%}
.sign-block small{font-size:5.7pt;line-height:1.1;color:#765d43;max-width:100%;overflow-wrap:anywhere}
.footer-meta{position:relative;flex:0 0 auto;width:100%;display:flex;justify-content:space-between;align-items:center;gap:4mm;margin-top:.8%;font-size:5.8pt;line-height:1.15;color:#765d43}
.serial,.date{position:static;max-width:48%;font-size:inherit;color:inherit;text-align:left;overflow-wrap:anywhere}
.date{text-align:right}
.registry-strip{position:relative;left:auto;right:auto;bottom:auto;flex:0 0 auto;display:flex;justify-content:center;gap:5mm;font-size:5pt;color:#765d43;flex-wrap:wrap;margin-top:.4%}
@media screen{.certificate{box-shadow:0 5px 25px #0002}}
@media print{html,body{width:283mm;height:196mm;background:#fff}.toolbar{display:none!important}.certificate{margin:0!important;break-after:avoid;page-break-after:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="toolbar"><button onclick="window.print()">அச்சிடு / PDF ஆகச் சேமி</button></div><main class="certificate theme-${theme}" style="--sign-count:${signers.length}"><div class="inner-content"><header class="brand-head">${logoMarkup}<div><div class="brand-center">${esc(brand.brandName||'பவிழிதழ்')}</div><div class="subtitle">${esc(brand.brandSubtitle||'காலாண்டு இலக்கிய இதழ்')}</div></div><div class="partner-heading">${cert.includePartner?esc(brand.partnerOrgName||'கூட்டாண்மை நிறுவனம்'):''}</div></header><h1 class="title">சான்றிதழ்</h1><p class="type">${esc(types[cert.type]||'சான்றிதழ்')}</p><div class="level-tag">${esc(themeLabels[cert.type]||'இலக்கிய அங்கீகாரம்')}</div><p class="intro">இதன் மூலம் சான்றளிக்கப்படுவது:</p><div class="honorific-line">திரு. / திருமதி / செல்வி / செல்வன் / திருநம்பி / திருநங்கை / திருநர்</div><div class="recipient">${esc(recipient)}</div><p class="message">${esc((cert.message||'தங்களது இலக்கியப் பங்களிப்பைப் பாராட்டி இச்சான்றிதழ் வழங்கப்படுகிறது.').replaceAll('[பெறுபவர் பெயர்]',recipient).replaceAll('[போட்டி / நிகழ்ச்சி பெயர்]',cert.eventName||'நிகழ்ச்சி').replaceAll('[பரிசு நிலை]',cert.rank||'சிறப்பிடம்'))}</p><div class="details"><strong>${esc(cert.eventName||'')}</strong>${cert.workTitle?`<br>படைப்பு: ${esc(cert.workTitle)}`:''}${cert.category?`<br>பிரிவு: ${esc(categories[cert.category]||cert.category)}`:''}${cert.rank?`<br><span class="rank">${esc(cert.rank)}</span>`:''}<br>${esc(cert.year||'')}</div><div class="seal-row">${seal}${partnerSeal}</div><div class="signature-area">${signers.join('')}</div>${registry}<div class="footer-meta"><div class="serial">சான்றிதழ் எண்: ${esc(cert.certificateNo||'')}</div><div class="date">வழங்கிய நாள்: ${esc(date)}</div></div></div></main></body></html>`;
 win.document.open();win.document.write(markup);win.document.close();
}

async function persistCollection(localKey,rows){await persistPaviSetting(localKey,rows);return rows;}
async function initAdminPanel(){
  const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  // Always cover the Admin dashboard immediately and require credentials on every fresh visit.
  sessionStorage.removeItem('pavizhidhal_admin_logged');
  document.body.classList.add('admin-auth-open');
  const overlay=document.createElement('div');overlay.className='admin-auth-overlay';overlay.id='adminAuthOverlay';
  overlay.innerHTML=`<form class="admin-auth-card" id="adminAuthForm"><div class="admin-auth-mark">❧</div><p class="section-eyebrow">பவிழிதழ் · பாதுகாப்பான நிர்வாக அணுகல்</p><h1>நிர்வாகி உள்நுழைவு</h1><p>ஒவ்வொரு முறையும் இந்தப் பக்கத்தைத் திறக்கும்போது உங்கள் Supabase Admin மின்னஞ்சல் மற்றும் கடவுச்சொல்லை மீண்டும் உள்ளிடவும்.</p><label>Admin மின்னஞ்சல்<input id="adminLoginEmail" type="email" autocomplete="username" required placeholder="உங்கள் Admin மின்னஞ்சல்"></label><label>கடவுச்சொல்<input id="adminLoginPassword" type="password" autocomplete="current-password" required placeholder="உங்கள் கடவுச்சொல்"></label><p id="adminAuthError" class="admin-auth-error" role="alert"></p><div class="admin-actions"><button class="admin-primary" id="adminLoginSubmit" type="submit">உள்நுழை</button><a class="admin-secondary" href="index.html">முகப்பிற்குத் திரும்பு</a></div></form>`;
  document.body.appendChild(overlay);
  // Clear any persisted browser session before asking for credentials. This is an Auth logout only;
  // it does not change database rows, settings, schema, policies, or Storage files.
  try{
    const {data:{session}}=await window.pavizhidhalSupabase.auth.getSession();
    if(session) await PaviDB.logout();
  }catch(err){console.warn('முந்தைய Admin அமர்வை முடிக்க முடியவில்லை:',err);}
  const form=overlay.querySelector('#adminAuthForm');
  form.addEventListener('submit',async e=>{
    e.preventDefault();const button=overlay.querySelector('#adminLoginSubmit');const errorBox=overlay.querySelector('#adminAuthError');
    button.disabled=true;button.textContent='சரிபார்க்கப்படுகிறது…';errorBox.textContent='';
    try{
      await PaviDB.login(overlay.querySelector('#adminLoginEmail').value.trim(),overlay.querySelector('#adminLoginPassword').value);
      await PaviDB.loadComments();
      await PaviDB.refreshPosts();
      sessionStorage.setItem('pavizhidhal_admin_logged','true');
      overlay.remove();document.body.classList.remove('admin-auth-open');
      await initAdminDashboard();
    }catch(err){errorBox.textContent='உள்நுழைவு தோல்வி: '+(err.message||err);button.disabled=false;button.textContent='மீண்டும் முயற்சி செய்';overlay.querySelector('#adminLoginPassword').value='';overlay.querySelector('#adminLoginPassword').focus();}
  });
}

async function initAdminDashboard(){

  const $=id=>document.getElementById(id);
  const setValue=(id,value)=>{const el=$(id);if(el)el.value=value??'';};
  const site=getSiteSettings();
  const updateDateInput=$('updateDate'),updateDateButton=$('saveUpdateDateBtn'),updateDateStatus=$('saveMessage');
  if(updateDateInput){
    try{updateDateInput.value=await PaviDB.getWebsiteUpdatedDate();}catch(err){if(updateDateStatus)updateDateStatus.textContent='தேதியைப் பெற முடியவில்லை: '+(err.message||err);}
  }
  if(updateDateButton)updateDateButton.addEventListener('click',async()=>{
    const date=updateDateInput?.value||'';
    if(!date){alert('தேதியைத் தேர்ந்தெடுக்கவும்');return;}
    updateDateButton.disabled=true;updateDateButton.textContent='சேமிக்கப்படுகிறது…';
    if(updateDateStatus)updateDateStatus.textContent='';
    try{await PaviDB.saveWebsiteUpdatedDate(date);if(updateDateStatus)updateDateStatus.textContent='தேதி Supabase-ல் சேமிக்கப்பட்டது ✓';}
    catch(err){if(updateDateStatus)updateDateStatus.textContent='சேமிக்க முடியவில்லை: '+(err.message||err);alert('தேதியைச் சேமிக்க முடியவில்லை: '+(err.message||err));}
    finally{updateDateButton.disabled=false;updateDateButton.textContent='தேதியைச் சேமிக்கவும்';}
  });
  ['siteTitle','kural','notice','founder','footer'].forEach(k=>setValue('setting'+k[0].toUpperCase()+k.slice(1),site[k]||''));setValue('settingEmail','pavizhithazh@gmail.com');setValue('settingGoatCounterCode',site.goatCounterCode||'');setValue('settingIssnNumber',site.issnNumber||'');setValue('settingUdyamNumber',site.udyamNumber||'');
  setValue('settingPrimaryColor',site.primaryColor||'#5c0601');setValue('settingGoldColor',site.goldColor||'#b8860b');
  const pageDefaults={home:['பவிழிதழ் – காலாண்டு இலக்கிய இல்லம்','மூன்று மாதங்களுக்கு ஒருமுறை, மரபின் வேரும் புதுமையின் சிறகும் இணையும் தமிழ் படைப்புகள் உங்கள் வாசிப்பிற்கு மலர்கின்றன.'],kavithai:['கவிதைகள்','பழம்பெரும் கவிதை ஏட்டின் வாசிப்பு நயத்தில் கவிதைகளை வாசியுங்கள்.'],kathai:['சிறுகதைகள்','பழங்காலக் கதை ஏட்டின் உணர்வில் சிறுகதைகளை வாசியுங்கள்.'],katturai:['கட்டுரைகள்','பழமையான ஏட்டுத் தாள் வடிவில் சிந்தனைக் கட்டுரைகள்.'],aaivukatturai:['ஆய்வுக் கட்டுரைகள்','செப்பேட்டு ஆவண நயத்தில் ஆய்வுப் படைப்புகள்.'],kulandhai:['குழந்தை இலக்கியம்','வண்ணமயமான ஏட்டில் குழந்தைகளுக்கான படைப்புகள்.'],authors_list:['எழுத்தாளர்கள்','பவிழிதழில் எழுதும் படைப்பாளர்களை அறிந்துகொள்ளுங்கள்.'],about:['எங்களைப் பற்றி','பவிழிதழின் நோக்கம், காலாண்டு வெளியீடுகள், விருதுகள் மற்றும் தொடர்பு விவரங்கள்.']};
  const loadPageEditor=()=>{const key=$('editPage').value,cfg=(site.pages||{})[key]||{},d=pageDefaults[key];setValue('editPageTitle',cfg.title||d[0]);setValue('editPageIntro',cfg.intro||d[1]);};
  $('editPage').addEventListener('change',loadPageEditor);loadPageEditor();
  $('siteSettingsForm').addEventListener('submit',async e=>{e.preventDefault();try{const logoFile=$('settingLogoFile').files[0],issnLogoFile=$('settingIssnLogoFile').files[0],udyamLogoFile=$('settingUdyamLogoFile').files[0];const logo=logoFile?await adminReadFile(logoFile):(site.logo||'');const issnLogo=issnLogoFile?await adminReadFile(issnLogoFile):(site.issnLogo||'');const udyamLogo=udyamLogoFile?await adminReadFile(udyamLogoFile):(site.udyamLogo||'');let issnNumber=$('settingIssnNumber').value.trim(),udyamNumber=$('settingUdyamNumber').value.trim();if(issnNumber&&!/^\d{4}-?\d{3}[\dXx]$/.test(issnNumber))throw new Error('ISSN எண்ணை 0000-0000 என்ற வடிவில் உள்ளிடவும்.');if(issnNumber){issnNumber=issnNumber.replace(/-/g,'').toUpperCase();issnNumber=issnNumber.slice(0,4)+'-'+issnNumber.slice(4);}if(udyamNumber&&!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/i.test(udyamNumber))throw new Error('Udyam எண்ணை UDYAM-XX-00-0000000 என்ற வடிவில் உள்ளிடவும்.');const data={...getSiteSettings(),issnLogo,udyamLogo,issnNumber,udyamNumber,siteTitle:$('settingSiteTitle').value.trim(),kural:$('settingKural').value.trim(),notice:$('settingNotice').value.trim(),founder:$('settingFounder').value.trim(),email:$('settingEmail').value.trim(),footer:$('settingFooter').value.trim(),goatCounterCode:$('settingGoatCounterCode').value.trim(),primaryColor:$('settingPrimaryColor').value,goldColor:$('settingGoldColor').value,logo,pages:getSiteSettings().pages||{}};await persistPaviSetting('pavizhidhal_site_settings',data);if(logo)localStorage.setItem('pavizhidhal_custom_logo',logo);alert('பொது தள அமைப்புகள் Supabase-ல் சேமிக்கப்பட்டன.');}catch(err){alert('சேமிக்க முடியவில்லை: '+(err.message||err));}});
  $('adminLogoutBtn').addEventListener('click',async()=>{await PaviDB.logout().catch(console.error);sessionStorage.removeItem('pavizhidhal_admin_logged');location.href='index.html';});
  $('pageEditorForm').addEventListener('submit',async e=>{e.preventDefault();try{const data=getSiteSettings();data.pages=data.pages||{};data.pages[$('editPage').value]={title:$('editPageTitle').value.trim(),intro:$('editPageIntro').value.trim()};await persistPaviSetting('pavizhidhal_site_settings',data);$('pageSaveStatus').textContent='Supabase-ல் சேமிக்கப்பட்டது ✓';}catch(err){alert('பக்கத்தைச் சேமிக்க முடியவில்லை: '+(err.message||err));}});

  // Quarterly issue manager: March / June / September / December, final Sunday.
  let quarterly=getSettingCollection('pavizhidhal_quarterly_issues'), editingQuarterId='';
  const quarterForm=$('quarterlyIssueForm');
  const refreshQuarterDate=()=>{if($('qiYear')&&$('qiMonth')){$('qiPublishDatePreview').textContent=`வெளியீட்டு நாள்: ${formatTaDate(lastSundayOfMonth($('qiYear').value,$('qiMonth').value))}`;}};
  ['qiYear','qiMonth'].forEach(id=>$(id)?.addEventListener('change',refreshQuarterDate));refreshQuarterDate();
  const fillQuarterPosts=selected=>{const box=$('qiFeaturedPostChoices');if(!box)return;const posts=getStoredPosts();const order=['kavithai','kathai','katturai','aaivukatturai','kulandhai'];const sorted=posts.slice().sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category));box.innerHTML=sorted.length?sorted.map(p=>`<label class="featured-choice"><input type="checkbox" value="${escapeHTML(p.id)}" ${selected.includes(String(p.id))?'checked':''}><span>${escapeHTML(p.title)} <small>— ${escapeHTML(p.author)} · ${getCategoryName(p.category)}</small></span></label>`).join(''):'<p>முதலில் படைப்புகளை வெளியிடுங்கள்.</p>';};
  $('qiSignatureFile')?.addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];const pv=$('qiSignaturePreview');if(!f||!pv)return;pv.src=URL.createObjectURL(f);pv.hidden=false;pv.style.display='block';$('qiSignatureStatus').textContent='தேர்ந்தெடுக்கப்பட்டது: '+f.name+' — “சேமி” அழுத்தவும்.';});
  $('qiSelectAllPosts')?.addEventListener('click',()=> $('qiFeaturedPostChoices').querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=true));
  $('qiClearPosts')?.addEventListener('click',()=> $('qiFeaturedPostChoices').querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false));
  const resetQuarter=()=>{editingQuarterId='';quarterForm.reset();setValue('qiYear',new Date().getFullYear());setValue('qiMonth','3');setValue('qiCoverTitle','பவிழிதழ்');setValue('qiCoverSubtitle','சொல்லில் மலரும் சிந்தனைகள்');setValue('qiForeword','');setValue('qiQuoteText','');if($('qiQuotePage'))$('qiQuotePage').checked=false;if($('qiSignatureStatus'))$('qiSignatureStatus').textContent='PNG கையொப்பப் படத்தைத் தேர்ந்தெடுக்கவும் (வெளிப்படையான பின்னணி சிறந்தது).';if($('qiSignaturePreview')){$('qiSignaturePreview').hidden=true;$('qiSignaturePreview').style.display='none';$('qiSignaturePreview').removeAttribute('src');}if($('qiFrontCoverStatus'))$('qiFrontCoverStatus').textContent='வெளியில் தயாரித்த அட்டைப் படத்தைத் தேர்ந்தெடுக்கவும்.';if($('qiBackCoverStatus'))$('qiBackCoverStatus').textContent='வெளியில் தயாரித்த பின்அட்டைப் படத்தைத் தேர்ந்தெடுக்கவும்.';fillQuarterPosts([]);refreshQuarterDate();$('qiSaveBtn').textContent='காலாண்டு இதழைச் சேமி';$('qiCancelBtn').hidden=true;};
  const drawQuarter=()=>renderAdminCollection('quarterlyIssuesList',quarterly.map(x=>({...x,summary:`${x.year} · ${x.monthName} · ${formatTaDate(x.publishDate)}`})),'quarter',row=>{editingQuarterId=row.id;setValue('qiYear',row.year);setValue('qiMonth',row.month);setValue('qiCoverTitle',row.coverTitle);setValue('qiCoverSubtitle',row.coverSubtitle);setValue('qiPdfUrl',row.pdfUrl);setValue('qiForeword',row.foreword||'');setValue('qiQuoteText',row.quoteText||'');if($('qiQuotePage'))$('qiQuotePage').checked=!!row.quotePage;if($('qiSignatureStatus'))$('qiSignatureStatus').textContent=row.signatureUrl?'கையொப்பம் சேமிக்கப்பட்டுள்ளது ✓ (புதிய PNG தேர்ந்தால் மாற்றப்படும்)':'PNG கையொப்பப் படத்தைத் தேர்ந்தெடுக்கவும் (வெளிப்படையான பின்னணி சிறந்தது).';if($('qiSignaturePreview')){if(row.signatureUrl){$('qiSignaturePreview').src=row.signatureUrl;$('qiSignaturePreview').hidden=false;$('qiSignaturePreview').style.display='block';}else{$('qiSignaturePreview').hidden=true;$('qiSignaturePreview').style.display='none';}}if($('qiFrontCoverStatus'))$('qiFrontCoverStatus').textContent=row.frontCoverUrl?'முன் அட்டை சேமிக்கப்பட்டுள்ளது ✓':'வெளியில் தயாரித்த அட்டைப் படத்தைத் தேர்ந்தெடுக்கவும்.';if($('qiBackCoverStatus'))$('qiBackCoverStatus').textContent=row.backCoverUrl?'பின் அட்டை சேமிக்கப்பட்டுள்ளது ✓':'வெளியில் தயாரித்த பின்அட்டைப் படத்தைத் தேர்ந்தெடுக்கவும்.';fillQuarterPosts(row.featuredPostIds||[]);refreshQuarterDate();$('qiSaveBtn').textContent='மாற்றங்களைச் சேமி';$('qiCancelBtn').hidden=false;$('quarterManager').scrollIntoView({behavior:'smooth'});},async id=>{if(!confirm('இந்தக் காலாண்டு இதழ் பதிவை நீக்கவா?'))return;try{quarterly=quarterly.filter(x=>x.id!==id);await persistCollection('pavizhidhal_quarterly_issues',quarterly);drawQuarter();}catch(e){alert('நீக்க முடியவில்லை: '+e.message);}});
  resetQuarter();drawQuarter();$('qiCancelBtn').addEventListener('click',resetQuarter);
  quarterForm.addEventListener('submit',async e=>{e.preventDefault();try{
    let pdfUrl=$('qiPdfUrl').value.trim();const file=$('qiPdfFile').files[0];if(file)pdfUrl=await adminReadFile(file,'magazine-pdfs');
    const old=quarterly.find(x=>String(x.id)===String(editingQuarterId))||{};
    const frontFile=$('qiFrontCoverFile')?.files?.[0],backFile=$('qiBackCoverFile')?.files?.[0];
    const frontCoverUrl=frontFile?await adminReadFile(frontFile,'site-images'):(old.frontCoverUrl||'');
    const backCoverUrl=backFile?await adminReadFile(backFile,'site-images'):(old.backCoverUrl||'');
    const sigFile=$('qiSignatureFile')?.files?.[0];
    if(sigFile&&!/png$/i.test(sigFile.type||sigFile.name)){throw new Error('கையொப்பம் PNG கோப்பாக இருக்க வேண்டும்.');}
    const signatureUrl=sigFile?await adminReadFile(sigFile,'site-images'):(old.signatureUrl||'');
    const year=Number($('qiYear').value),month=Number($('qiMonth').value),monthName=quarterMonthName(month),date=lastSundayOfMonth(year,month);
    const featuredPostIds=[...$('qiFeaturedPostChoices').querySelectorAll('input:checked')].map(x=>x.value);
    const row={...old,id:editingQuarterId||makeId('quarter'),year,month,monthName,publishDate:date,issueNumber:({3:'01',6:'02',9:'03',12:'04'})[month],title:`${year} ${monthName} காலாண்டு இதழ்`,coverTitle:$('qiCoverTitle').value.trim()||'பவிழிதழ்',coverSubtitle:$('qiCoverSubtitle').value.trim(),frontCoverUrl,backCoverUrl,signatureUrl,foreword:$('qiForeword').value.trim(),quotePage:!!$('qiQuotePage')?.checked,quoteText:$('qiQuoteText').value.trim(),pdfUrl,featuredPostIds};
    const index=quarterly.findIndex(x=>x.id===row.id);if(index>=0)quarterly[index]=row;else quarterly.unshift(row);await persistCollection('pavizhidhal_quarterly_issues',quarterly);drawQuarter();resetQuarter();alert('காலாண்டு இதழ் Supabase-ல் சேமிக்கப்பட்டது. நீங்கள் தேர்ந்தெடுத்த அட்டைப்படங்களும் முன்னுரையும் சேமிக்கப்பட்டுள்ளன.');
  }catch(err){alert('இதழைச் சேமிக்க முடியவில்லை: '+(err.message||err));}});

  // Semiannual best-writer recognition.
  let awards=getSettingCollection('pavizhidhal_semiannual_awards'),editingAwardId='';
  const awardForm=$('semiAwardForm');
  const drawAwards=()=>renderAdminCollection('semiAwardsList',awards.map(x=>({...x,summary:`${x.year} · ${x.periodLabel} · ${x.winner}`})),'award',row=>{editingAwardId=row.id;setValue('saYear',row.year);setValue('saPeriod',row.period);setValue('saWinner',row.winner);setValue('saTitle',row.awardTitle);setValue('saBio',row.bio);setValue('saCertificate',row.certificate);setValue('saPrize',row.prize);$('semiAwardManager').scrollIntoView({behavior:'smooth'});$('saSaveBtn').textContent='மாற்றங்களைச் சேமி';$('saCancelBtn').hidden=false;},async id=>{if(!confirm('இந்த விருது அறிவிப்பை நீக்கவா?'))return;try{awards=awards.filter(x=>x.id!==id);await persistCollection('pavizhidhal_semiannual_awards',awards);drawAwards();}catch(e){alert(e.message);}});
  const resetAward=()=>{editingAwardId='';awardForm.reset();setValue('saYear',new Date().getFullYear());$('saSaveBtn').textContent='விருதை வெளியிடு';$('saCancelBtn').hidden=true;};
  resetAward();drawAwards();$('saCancelBtn').addEventListener('click',resetAward);
  awardForm.addEventListener('submit',async e=>{e.preventDefault();try{const period=$('saPeriod').value;const row={id:editingAwardId||makeId('semi_award'),year:Number($('saYear').value),period,periodLabel:period==='first'?'முதல் அரையாண்டு (ஜனவரி–ஜூன்)':'இரண்டாம் அரையாண்டு (ஜூலை–டிசம்பர்)',winner:$('saWinner').value.trim(),awardTitle:$('saTitle').value.trim()||'அரையாண்டு சிறந்த எழுத்தாளர் விருது',bio:$('saBio').value.trim(),certificate:$('saCertificate').value.trim()||'சிறப்புச் சான்றிதழ்',prize:$('saPrize').value.trim()};const i=awards.findIndex(x=>x.id===row.id);if(i>=0)awards[i]=row;else awards.unshift(row);await persistCollection('pavizhidhal_semiannual_awards',awards);drawAwards();resetAward();alert('அரையாண்டு விருது Supabase-ல் சேமிக்கப்பட்டது.');}catch(err){alert('சேமிக்க முடியவில்லை: '+err.message);}});

  // Annual literary contests.
  let contests=getSettingCollection('pavizhidhal_annual_contests'),editingContestId='';const contestForm=$('annualContestForm');
  const drawContests=()=>renderAdminCollection('annualContestsList',contests.map(x=>({...x,summary:`${x.year} · ${getCategoryName(x.category)} · ${x.startDate||''} முதல் ${x.endDate||''}`})),'contest',row=>{editingContestId=row.id;setValue('acYear',row.year);setValue('acTitle',row.title);setValue('acCategory',row.category);setValue('acStart',row.startDate);setValue('acEnd',row.endDate);setValue('acRules',row.rules);setValue('acPrizes',row.prizes);setValue('acWinner',row.winner);setValue('acWinnerMessage',row.winnerMessage);$('annualContestManager').scrollIntoView({behavior:'smooth'});$('acSaveBtn').textContent='மாற்றங்களைச் சேமி';$('acCancelBtn').hidden=false;},async id=>{if(!confirm('இந்தப் போட்டியை நீக்கவா?'))return;try{contests=contests.filter(x=>x.id!==id);await persistCollection('pavizhidhal_annual_contests',contests);drawContests();}catch(e){alert(e.message);}});
  const resetContest=()=>{editingContestId='';contestForm.reset();setValue('acYear',new Date().getFullYear());$('acSaveBtn').textContent='போட்டியைச் சேமி';$('acCancelBtn').hidden=true;};resetContest();drawContests();$('acCancelBtn').addEventListener('click',resetContest);
  contestForm.addEventListener('submit',async e=>{e.preventDefault();try{const row={id:editingContestId||makeId('contest'),year:Number($('acYear').value),title:$('acTitle').value.trim(),category:$('acCategory').value,startDate:$('acStart').value,endDate:$('acEnd').value,rules:$('acRules').value.trim(),prizes:$('acPrizes').value.trim(),winner:$('acWinner').value.trim(),winnerMessage:$('acWinnerMessage').value.trim()};const i=contests.findIndex(x=>x.id===row.id);if(i>=0)contests[i]=row;else contests.unshift(row);await persistCollection('pavizhidhal_annual_contests',contests);drawContests();resetContest();alert('ஆண்டு இலக்கியப் போட்டி Supabase-ல் சேமிக்கப்பட்டது.');}catch(err){alert('சேமிக்க முடியவில்லை: '+err.message);}});

  // Special awards: emerging writer and lifetime contribution.
  let special=getSettingCollection('pavizhidhal_special_awards'),editingSpecialId='';const specialForm=$('specialAwardForm');
  const drawSpecial=()=>renderAdminCollection('specialAwardsList',special.map(x=>({...x,summary:`${x.year} · ${x.person}`})),'special',row=>{editingSpecialId=row.id;setValue('spYear',row.year);setValue('spType',row.awardType);setValue('spPerson',row.person);setValue('spDescription',row.description);setValue('spRecognition',row.recognition);$('specialAwardManager').scrollIntoView({behavior:'smooth'});$('spSaveBtn').textContent='மாற்றங்களைச் சேமி';$('spCancelBtn').hidden=false;},async id=>{if(!confirm('இந்தச் சிறப்பு விருதை நீக்கவா?'))return;try{special=special.filter(x=>x.id!==id);await persistCollection('pavizhidhal_special_awards',special);drawSpecial();}catch(e){alert(e.message);}});
  const resetSpecial=()=>{editingSpecialId='';specialForm.reset();setValue('spYear',new Date().getFullYear());$('spSaveBtn').textContent='சிறப்பு விருதைச் சேமி';$('spCancelBtn').hidden=true;};resetSpecial();drawSpecial();$('spCancelBtn').addEventListener('click',resetSpecial);
  specialForm.addEventListener('submit',async e=>{e.preventDefault();try{const row={id:editingSpecialId||makeId('special_award'),year:Number($('spYear').value),awardType:$('spType').value,person:$('spPerson').value.trim(),description:$('spDescription').value.trim(),recognition:$('spRecognition').value.trim()};const i=special.findIndex(x=>x.id===row.id);if(i>=0)special[i]=row;else special.unshift(row);await persistCollection('pavizhidhal_special_awards',special);drawSpecial();resetSpecial();alert('சிறப்பு விருது Supabase-ல் சேமிக்கப்பட்டது.');}catch(err){alert('சேமிக்க முடியவில்லை: '+err.message);}});

  // Annual anthology book / PDF.
  let anthologies=getSettingCollection('pavizhidhal_annual_anthologies'),editingAnthologyId='';const anthologyForm=$('anthologyForm');
  const drawAnthologies=()=>renderAdminCollection('anthologiesList',anthologies.map(x=>({...x,summary:`${x.year} · ${x.pdfUrl?'PDF இணைக்கப்பட்டுள்ளது':'PDF இணைக்கப்படவில்லை'}`})),'anthology',row=>{editingAnthologyId=row.id;setValue('anYear',row.year);setValue('anTitle',row.title);setValue('anDescription',row.description);setValue('anPdfUrl',row.pdfUrl);$('anthologyManager').scrollIntoView({behavior:'smooth'});$('anSaveBtn').textContent='மாற்றங்களைச் சேமி';$('anCancelBtn').hidden=false;},async id=>{if(!confirm('இந்தத் தொகுப்பு நூல் பதிவை நீக்கவா?'))return;try{anthologies=anthologies.filter(x=>x.id!==id);await persistCollection('pavizhidhal_annual_anthologies',anthologies);drawAnthologies();}catch(e){alert(e.message);}});
  const resetAnthology=()=>{editingAnthologyId='';anthologyForm.reset();setValue('anYear',new Date().getFullYear());$('anSaveBtn').textContent='தொகுப்பு நூலைச் சேமி';$('anCancelBtn').hidden=true;};resetAnthology();drawAnthologies();$('anCancelBtn').addEventListener('click',resetAnthology);
  anthologyForm.addEventListener('submit',async e=>{e.preventDefault();try{let pdfUrl=$('anPdfUrl').value.trim();const file=$('anPdfFile').files[0];if(file)pdfUrl=await adminReadFile(file,'magazine-pdfs');const row={id:editingAnthologyId||makeId('anthology'),year:Number($('anYear').value),title:$('anTitle').value.trim(),description:$('anDescription').value.trim(),pdfUrl};const i=anthologies.findIndex(x=>x.id===row.id);if(i>=0)anthologies[i]=row;else anthologies.unshift(row);await persistCollection('pavizhidhal_annual_anthologies',anthologies);drawAnthologies();resetAnthology();alert('ஆண்டுத் தொகுப்பு நூல் Supabase-ல் சேமிக்கப்பட்டது.');}catch(err){alert('சேமிக்க முடியவில்லை: '+err.message);}});

  $('printQuarterIssueBtn')?.addEventListener('click',()=>{const target=editingQuarterId?quarterly.find(x=>x.id===editingQuarterId):quarterly[0];if(!target){alert('முதலில் காலாண்டு இதழைச் சேமிக்கவும்.');return;}window.open(`issue-print.html?id=${encodeURIComponent(target.id)}`,'_blank');});

  // Public downloadable certificate archive: PDF files in Supabase Storage + metadata in public.certificates.
  const certificatePdfForm=$('certificatePdfUploadForm');
  let uploadedCertificateRows=[];
  const uploadedCertificateList=$('uploadedCertificatesList');
  const refreshUploadedCertificateRows=async()=>{
    if(!uploadedCertificateList)return;
    uploadedCertificateList.innerHTML='<div class="post-card">சான்றிதழ் பதிவுகள் ஏற்றப்படுகின்றன…</div>';
    try{uploadedCertificateRows=await PaviDB.listCertificateFiles(true);renderUploadedCertificates();}
    catch(err){uploadedCertificateList.innerHTML='<div class="post-card"><strong>சான்றிதழ் Database அமைப்பு இன்னும் இயக்கப்படவில்லை.</strong><p>ZIP-இல் உள்ள SUPABASE_CERTIFICATES_SETUP.sql கோப்பை Supabase SQL Editor-ல் ஒருமுறை இயக்கிய பிறகு இங்கே திரும்பவும் திறக்கவும்.</p><p class="admin-help">'+escapeHTML(err.message||err)+'</p></div>';}
  };
  const renderUploadedCertificates=()=>{
    if(!uploadedCertificateList)return;
    if(!uploadedCertificateRows.length){uploadedCertificateList.innerHTML='<div class="post-card">இன்னும் பதிவேற்றிய சான்றிதழ்கள் இல்லை.</div>';return;}
    uploadedCertificateList.innerHTML=uploadedCertificateRows.map(r=>{
      const date=r.issued_on?new Date(`${r.issued_on}T00:00:00`).toLocaleDateString('ta-IN'):'—';
      const fileUrl=PaviDB.certificatePublicUrl(r.file_path);
      return `<article class="post-card certificate-admin-row"><div><h3>${escapeHTML(r.recipient_name)}</h3><p>${escapeHTML(r.certificate_no)} · ${escapeHTML(r.event_name)} · ${escapeHTML(date)}</p><p>${escapeHTML(r.file_name||'PDF')} · ${r.is_published?'பொதுப் பக்கத்தில் வெளியிடப்பட்டுள்ளது':'பொதுப் பக்கத்தில் மறைக்கப்பட்டுள்ளது'}</p></div><div class="admin-actions"><a class="admin-secondary certificate-file-open" href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener">PDF பார்க்க</a><button class="admin-secondary" type="button" data-cert-admin-download="${escapeHTML(r.id)}">PDF பதிவிறக்கு</button><button class="admin-secondary" type="button" data-cert-publish="${escapeHTML(r.id)}">${r.is_published?'பொதுப் பக்கத்தில் மறை':'பொதுப் பக்கத்தில் வெளியிடு'}</button><button class="admin-danger" type="button" data-cert-delete="${escapeHTML(r.id)}">நீக்கு</button></div></article>`;
    }).join('');
    uploadedCertificateList.querySelectorAll('[data-cert-admin-download]').forEach(btn=>btn.addEventListener('click',async()=>{
      const row=uploadedCertificateRows.find(x=>String(x.id)===btn.dataset.certAdminDownload);if(!row)return;
      btn.disabled=true;const old=btn.textContent;btn.textContent='பதிவிறக்குகிறது…';
      await downloadPublicPdf(PaviDB.certificatePublicUrl(row.file_path),`${(row.recipient_name||'pavizhidhal').replace(/[^\p{L}\p{N}-]+/gu,'-')}-${row.certificate_no||'certificate'}.pdf`);
      btn.disabled=false;btn.textContent=old;
    }));
    uploadedCertificateList.querySelectorAll('[data-cert-publish]').forEach(btn=>btn.addEventListener('click',async()=>{
      const row=uploadedCertificateRows.find(x=>String(x.id)===btn.dataset.certPublish);if(!row)return;
      btn.disabled=true;try{await PaviDB.setCertificatePublished(row.id,!row.is_published);await refreshUploadedCertificateRows();}catch(err){alert('வெளியீட்டு நிலையை மாற்ற முடியவில்லை: '+(err.message||err));btn.disabled=false;}
    }));
    uploadedCertificateList.querySelectorAll('[data-cert-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
      const row=uploadedCertificateRows.find(x=>String(x.id)===btn.dataset.certDelete);if(!row||!confirm(`${row.recipient_name} அவர்களின் சான்றிதழை நிரந்தரமாக நீக்கவா?`))return;
      btn.disabled=true;try{await PaviDB.deleteCertificateFileRecord(row.id);try{await PaviDB.removeCertificateFile(row.file_path);}catch(storageErr){console.warn('Certificate storage cleanup:',storageErr);}await refreshUploadedCertificateRows();alert('சான்றிதழ் பதிவு நீக்கப்பட்டது.');}catch(err){alert('நீக்க முடியவில்லை: '+(err.message||err));btn.disabled=false;}
    }));
  };
  certificatePdfForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const submit=$('certificatePdfUploadBtn');const file=$('certificatePdfFile').files?.[0];
    if(!file){alert('சான்றிதழ் PDF கோப்பைத் தேர்ந்தெடுக்கவும்.');return;}
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){alert('PDF கோப்பை மட்டும் பதிவேற்றவும்.');return;}
    if(file.size>20*1024*1024){alert('PDF கோப்பு 20 MB-ஐ விடச் சிறியதாக இருக்க வேண்டும்.');return;}
    submit.disabled=true;const label=submit.textContent;submit.textContent='PDF பதிவேற்றம் நடைபெறுகிறது…';
    let path='';
    try{
      path=await PaviDB.uploadCertificateFile(file);
      const year=Number($('uploadedCertYear').value)||new Date().getFullYear();
      const number=$('uploadedCertNumber').value.trim()||`PAVI-${year}-${Math.floor(100000+Math.random()*900000)}`;
      const row={certificate_no:number,recipient_name:$('uploadedCertRecipient').value.trim(),certificate_type:$('uploadedCertType').value,event_name:$('uploadedCertEvent').value.trim(),work_title:$('uploadedCertWorkTitle').value.trim()||null,category:$('uploadedCertCategory').value||null,issue_year:year,issued_on:$('uploadedCertDate').value,file_path:path,file_name:file.name,is_published:$('uploadedCertPublish').checked,created_by:(await window.pavizhidhalSupabase.auth.getUser()).data.user?.id||null};
      await PaviDB.createCertificateFileRecord(row);
      certificatePdfForm.reset();$('uploadedCertYear').value=new Date().getFullYear();$('uploadedCertDate').value=pavizhidhalLocalDate();$('uploadedCertPublish').checked=true;
      await refreshUploadedCertificateRows();
      alert('சான்றிதழ் PDF மற்றும் விவரங்கள் Supabase-ல் சேமிக்கப்பட்டன. பொதுப் பக்கத்தில் வெளியிடத் தேர்ந்தெடுத்திருந்தால் உடனே பதிவிறக்கக் கிடைக்கும்.');
    }catch(err){if(path){try{await PaviDB.removeCertificateFile(path);}catch(cleanErr){console.warn(cleanErr);}}alert('சான்றிதழைப் பதிவேற்ற / சேமிக்க முடியவில்லை: '+(err.message||err));}
    finally{submit.disabled=false;submit.textContent=label;}
  });
  if(certificatePdfForm){$('uploadedCertYear').value=new Date().getFullYear();$('uploadedCertDate').value=pavizhidhalLocalDate();$('uploadedCertPublish').checked=true;refreshUploadedCertificateRows();}

  // Certificate branding/signature assets are stored in existing site_images + site_settings only.
  const certificateBrandingForm=$('certificateBrandingForm');
  let certificateBranding=safeParseJSON(localStorage.getItem('pavizhidhal_certificate_branding'),{})||{};
  const certificateAssetInputs=[
    ['certOrgLogoFile','orgLogoImage','certOrgLogoStatus','அமைப்பின் லோகோ'],
    ['certPartnerLogoFile','partnerLogoImage','certPartnerLogoStatus','கூட்டாண்மை லோகோ'],
    ['certSealFile','sealImage','certSealStatus','பவிழிதழ் முத்திரை'],
    ['certPartnerSealFile','partnerSealImage','certPartnerSealStatus','கூட்டாண்மை முத்திரை'],
    ['certJudgeFile','judgeImage','certJudgeStatus','நடுவர் கையொப்பம்'],
    ['certFounderFile','founderImage','certFounderStatus','நிறுவனர் கையொப்பம்'],
    ['certCoordinatorFile','coordinatorImage','certCoordinatorStatus','ஒருங்கிணைப்பாளர் கையொப்பம்'],
    ['certPartnerSignFile','partnerSignatureImage','certPartnerSignStatus','கூட்டாண்மை பிரதிநிதி கையொப்பம்']
  ];
  const loadCertificateBranding=()=>{
    certificateBranding.founderImage=certificateBranding.founderImage||certificateBranding.sign1Image||'';
    certificateBranding.founderName=fixPaviName(certificateBranding.founderName||certificateBranding.sign1Name||'கவிஞர், எழுத்தாளர் செல்வி இரா.பவித்ரா');
    certificateBranding.founderRole=certificateBranding.founderRole||certificateBranding.sign1Role||'நிறுவனர்';
    certificateBranding.coordinatorName=certificateBranding.coordinatorName||certificateBranding.sign2Name||'';
    certificateBranding.coordinatorRole=certificateBranding.coordinatorRole||certificateBranding.sign2Role||'ஒருங்கிணைப்பாளர்';
    certificateBranding.coordinatorImage=certificateBranding.coordinatorImage||certificateBranding.sign2Image||'';
    setValue('certBrandName',certificateBranding.brandName||'பவிழிதழ்');setValue('certBrandSubtitle',certificateBranding.brandSubtitle||'காலாண்டு இலக்கிய இதழ்');
    setValue('certLogoMode',certificateBranding.logoMode||'pavi');
    setValue('certPartnerOrgName',certificateBranding.partnerOrgName||'');
    setValue('certJudgeName',certificateBranding.judgeName||'');setValue('certJudgeRole',certificateBranding.judgeRole||'நடுவர்');
    setValue('certFounderName',certificateBranding.founderName);setValue('certFounderRole',certificateBranding.founderRole);
    setValue('certCoordinatorName',certificateBranding.coordinatorName||'');setValue('certCoordinatorRole',certificateBranding.coordinatorRole||'ஒருங்கிணைப்பாளர்');
    setValue('certPartnerSignName',certificateBranding.partnerSignName||'');setValue('certPartnerSignRole',certificateBranding.partnerSignRole||'நிறுவனப் பிரதிநிதி');
    setValue('certIssnStatus',certificateBranding.issnStatus||'not_applied');setValue('certIssnMedium',certificateBranding.issnMedium||'online');setValue('certIssnNumber',certificateBranding.issnNumber||'');
    setValue('certUdyamStatus',certificateBranding.udyamStatus||'not_registered');setValue('certUdyamNumber',certificateBranding.udyamNumber||'');
    certificateAssetInputs.forEach(([,key,statusId,label])=>{const status=$(statusId);if(status)status.textContent=certificateBranding[key]?'ஏற்கெனவே சேமிக்கப்பட்டுள்ளது ✓ · புதிய கோப்பைத் தேர்ந்தெடுத்தால் மாற்றப்படும்.':`${label}: இன்னும் பதிவேற்றப்படவில்லை.`;});
  };
  loadCertificateBranding();
  certificateBrandingForm.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('certificateBrandingSaveBtn');btn.disabled=true;const oldText=btn.textContent;btn.textContent='பதிவேற்றம் / சேமிப்பு நடைபெறுகிறது…';
    try{
      const next={...certificateBranding,brandName:$('certBrandName').value.trim()||'பவிழிதழ்',brandSubtitle:$('certBrandSubtitle').value.trim()||'காலாண்டு இலக்கிய இதழ்',logoMode:$('certLogoMode').value,partnerOrgName:$('certPartnerOrgName').value.trim(),judgeName:$('certJudgeName').value.trim(),judgeRole:$('certJudgeRole').value.trim()||'நடுவர்',founderName:$('certFounderName').value.trim(),founderRole:$('certFounderRole').value.trim()||'நிறுவனர்',sign1Name:$('certFounderName').value.trim(),sign1Role:$('certFounderRole').value.trim()||'நிறுவனர்',coordinatorName:$('certCoordinatorName').value.trim(),coordinatorRole:$('certCoordinatorRole').value.trim()||'ஒருங்கிணைப்பாளர்',partnerSignName:$('certPartnerSignName').value.trim(),partnerSignRole:$('certPartnerSignRole').value.trim()||'நிறுவனப் பிரதிநிதி',issnStatus:$('certIssnStatus').value,issnMedium:$('certIssnMedium').value,issnNumber:$('certIssnNumber').value.trim(),udyamStatus:$('certUdyamStatus').value,udyamNumber:$('certUdyamNumber').value.trim()};
      for(const [fileId,key,statusId,label] of certificateAssetInputs){const file=$(fileId)?.files?.[0];if(!file)continue;if(!file.type.startsWith('image/'))throw new Error(`${label}: படக் கோப்பை மட்டும் தேர்ந்தெடுக்கவும்.`);if(file.size>5*1024*1024)throw new Error(`${label}: 5 MB-க்குள் உள்ள கோப்பைத் தேர்ந்தெடுக்கவும்.`);next[key]=await adminReadFile(file,'site-images');}
      // Keep the older property names so existing certificates/settings remain compatible.
      next.sign1Image=next.founderImage||next.sign1Image||'';
      if(!next.founderName)throw new Error('நிறுவனர் பெயரை உள்ளிடவும்.');
      if(next.issnStatus==='assigned'){if(!/^\d{4}-?\d{3}[\dXx]$/.test(next.issnNumber))throw new Error('ISSN வழங்கப்பட்ட நிலையைத் தேர்ந்தெடுத்தால் சரியான 8 இலக்க ISSN எண்ணை உள்ளிடவும்.');const rawIssn=next.issnNumber.replace(/-/g,'').toUpperCase();next.issnNumber=rawIssn.slice(0,4)+'-'+rawIssn.slice(4);}
      if(next.issnStatus!=='assigned')next.issnNumber='';
      if(next.udyamStatus==='registered'&&!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/i.test(next.udyamNumber))throw new Error('Udyam பதிவு நிலையைத் தேர்ந்தெடுத்தால் சரியான UDYAM-XX-00-0000000 வடிவிலான எண்ணை உள்ளிடவும்.');
      if(next.udyamStatus!=='registered')next.udyamNumber='';
      await persistPaviSetting('pavizhidhal_certificate_branding',next);certificateBranding=next;
      certificateAssetInputs.forEach(([fileId,,statusId])=>{if($(fileId))$(fileId).value='';});loadCertificateBranding();
      const missing=[];if(!next.judgeImage||!next.judgeName)missing.push('நடுவர்');if(!(next.founderImage||next.sign1Image))missing.push('நிறுவனர்');
      alert(missing.length?`அமைப்புகள் சேமிக்கப்பட்டன. சான்றிதழ் உருவாக்குவதற்கு முன் கட்டாயமான ${missing.join(' மற்றும் ')} கையொப்பத்தைப் பதிவேற்றவும்.`:'லோகோ, முத்திரைகள் மற்றும் கையொப்ப அமைப்புகள் Supabase-ல் சேமிக்கப்பட்டன.');
    }catch(err){alert('சேமிக்க முடியவில்லை: '+(err.message||err));}
    finally{btn.disabled=false;btn.textContent=oldText;}
  });

  // Certificate issue manager: all five certificate categories are stored in the existing site_settings table.
  let certificates=getSettingCollection('pavizhidhal_certificates'),editingCertificateId='';
  const certificateForm=$('certificateForm');
  const certificateTypeNames={selection:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்புகளுக்கான சான்றிதழ்',selected_work:'தேர்வு / தேர்ந்தெடுக்கப்பட்ட படைப்புகளுக்கான சான்றிதழ்',participation:'பங்கேற்புச் சான்றிதழ்',special:'சிறப்புநிலைச் சான்றிதழ்',winner:'வெற்றியாளர் சான்றிதழ்'};
  const certificateCategoryNames={kavithai:'கவிதை',kathai:'சிறுகதை',katturai:'கட்டுரை',aaivukatturai:'ஆய்வுக் கட்டுரை',kulandhai:'குழந்தை இலக்கியம்'};
  const renderCertificates=()=>renderAdminCollection('certificatesList',certificates.map(x=>({...x,type:x.type==='selected_work'?'selection':x.type,title:x.recipient,summary:`${certificateTypeNames[x.type]||'சான்றிதழ்'} · ${x.eventName} · ${x.certificateNo}`})),'certificate',row=>{editingCertificateId=row.id;setValue('certificateType',row.type==='selected_work'?'selection':row.type);setValue('certificateNumber',row.certificateNo||'');setValue('certificateRecipient',row.recipient);setValue('certificateEvent',row.eventName);setValue('certificateWorkTitle',row.workTitle);setValue('certificateCategory',row.category);setValue('certificateYear',row.year);setValue('certificateRank',row.rank);setValue('certificateDate',row.issueDate);setValue('certificateMessage',row.message);$('certificateFounderIsJudge').checked=!!row.founderIsJudge;$('certificateIncludeCoordinator').checked=!!row.includeCoordinator;$('certificateIncludePartner').checked=!!row.includePartner;$('certificateSaveBtn').textContent='மாற்றங்களைச் சேமி';$('certificateCancelBtn').hidden=false;$('certificateManager').scrollIntoView({behavior:'smooth'});},async id=>{if(!confirm('இந்தச் சான்றிதழ் பதிவை நீக்கவா?'))return;try{certificates=certificates.filter(x=>x.id!==id);await persistCollection('pavizhidhal_certificates',certificates);renderCertificates();updateAdminStats();}catch(e){alert('நீக்க முடியவில்லை: '+(e.message||e));}});
  const certificateBodyDefaults={
    selection:'பவிழிதழ் நடத்திய தமிழ் இலக்கியத் தேர்வு / படைப்புத் தேர்வில் பங்கேற்று, தங்களது திறமையையும் படைப்பாற்றலையும் வெளிப்படுத்தி சிறப்பான சாதனை படைத்த [பெறுபவர் பெயர்] அவர்களுக்கு இச்சான்றிதழ் அன்புடன் வழங்கப்படுகிறது.',
    participation:'பவிழிதழ் நடத்திய இலக்கிய நிகழ்ச்சி / போட்டியில் ஆர்வத்துடன் பங்கேற்று, தங்களது திறமையையும் படைப்பாற்றலையும் வெளிப்படுத்திய [பெறுபவர் பெயர்] அவர்களுக்கு இச்சான்றிதழ் மகிழ்ச்சியுடன் வழங்கப்படுகிறது.',
    special:'பவிழிதழ் நடத்திய இலக்கிய நிகழ்வில் தங்களது தனித்துவமான திறமை, படைப்பாற்றல் மற்றும் சிறப்பான பங்களிப்பின் மூலம் குறிப்பிடத்தக்க சாதனை படைத்த [பெறுபவர் பெயர்] அவர்களுக்கு இச்சிறப்புச் சான்றிதழ் வழங்கி கௌரவிக்கப்படுகிறது.',
    winner:'பவிழிதழ் நடத்திய [போட்டி / நிகழ்ச்சி பெயர்] போட்டியில் [பரிசு நிலை] பெற்று வெற்றியடைந்த [பெறுபவர் பெயர்] அவர்களுக்கு அவர்களின் திறமை, முயற்சி மற்றும் சாதனையைப் பாராட்டி இச்சான்றிதழ் பெருமையுடன் வழங்கப்படுகிறது.'
  };
  let lastCertificateDefault='';
  $('certificateType').addEventListener('change',()=>{const box=$('certificateMessage');if(!box.value.trim()||box.value===lastCertificateDefault){box.value=certificateBodyDefaults[$('certificateType').value]||'';lastCertificateDefault=box.value;}});
    const resetCertificate=()=>{editingCertificateId='';certificateForm.reset();setValue('certificateYear',new Date().getFullYear());setValue('certificateDate',pavizhidhalLocalDate());$('certificateMessage').value=certificateBodyDefaults[$('certificateType').value]||'';lastCertificateDefault=$('certificateMessage').value;$('certificateSaveBtn').textContent='சான்றிதழ் பதிவைச் சேமி';$('certificateCancelBtn').hidden=true;};
  resetCertificate();renderCertificates();$('certificateCancelBtn').addEventListener('click',resetCertificate);
  certificateForm.addEventListener('submit',async e=>{e.preventDefault();try{const old=certificates.find(x=>x.id===editingCertificateId);const year=Number($('certificateYear').value);const enteredNo=($('certificateNumber').value||'').trim();const certNo=enteredNo||old?.certificateNo||`PAVI-${year}-${String(Date.now()).slice(-6)}`;if(certificates.some(x=>x.id!==editingCertificateId&&String(x.certificateNo||'').trim().toLowerCase()===certNo.toLowerCase())){alert('இந்தச் சான்றிதழ் எண் ஏற்கெனவே வேறு சான்றிதழுக்கு உள்ளது. வேறு எண்ணை உள்ளிடவும்.');return;}const row={id:editingCertificateId||makeId('certificate'),certificateNo:certNo,type:$('certificateType').value,recipient:$('certificateRecipient').value.trim(),eventName:$('certificateEvent').value.trim(),workTitle:$('certificateWorkTitle').value.trim(),category:$('certificateCategory').value,year,rank:$('certificateRank').value.trim(),issueDate:$('certificateDate').value,message:$('certificateMessage').value.trim()||certificateBodyDefaults[$('certificateType').value]||'தங்களது இலக்கியப் பங்களிப்பைப் பாராட்டி இச்சான்றிதழ் வழங்கப்படுகிறது.',founderIsJudge:$('certificateFounderIsJudge').checked,includeCoordinator:$('certificateIncludeCoordinator').checked,includePartner:$('certificateIncludePartner').checked};const i=certificates.findIndex(x=>x.id===row.id);if(i>=0)certificates[i]=row;else certificates.unshift(row);await persistCollection('pavizhidhal_certificates',certificates);renderCertificates();updateAdminStats();resetCertificate();alert('சான்றிதழ் பதிவு Supabase-ல் பாதுகாப்பாகச் சேமிக்கப்பட்டது. அச்சிடும்போது நடுவர் மற்றும் நிறுவனர் கட்டாயக் கையொப்பங்கள் சரிபார்க்கப்படும்.');}catch(err){alert('சான்றிதழைச் சேமிக்க முடியவில்லை: '+(err.message||err));}});

  // Legacy settings retained for backward compatibility; old content is not removed.
  const issue=safeParseJSON(localStorage.getItem('pavizhidhal_issue_settings'),{});
  const social=safeParseJSON(localStorage.getItem('pavizhidhal_social'),{});setValue('waLink',social.wa);setValue('fbLink',social.fb);setValue('instaLink',social.insta);setValue('ytLink',social.yt);
  $('adminSocialForm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');const status=$('socialLinksSaveStatus');const old=btn.textContent;btn.disabled=true;btn.textContent='சேமிக்கப்படுகிறது…';if(status)status.textContent='';
    try{
      const normalised={wa:'',fb:'',insta:'',yt:''};
      for(const key of Object.keys(normalised)){
        const raw=$(`${key==='wa'?'waLink':key==='fb'?'fbLink':key==='insta'?'instaLink':'ytLink'}`).value.trim();
        if(raw){normalised[key]=safeSocialUrl(raw,key);if(!normalised[key])throw new Error(`${key==='wa'?'WhatsApp':key==='fb'?'Facebook':key==='insta'?'Instagram':'YouTube'} இணைப்பின் முகவரியைச் சரிபார்க்கவும். முழுமையான https:// இணைப்பை உள்ளிடவும்.`);}
      }
      await persistPaviSetting('pavizhidhal_social',normalised);
      loadSocialLinks();if(status)status.textContent='இணைப்புகள் Supabase-ல் சேமிக்கப்பட்டன. எல்லாப் பொதுப் பக்கங்களிலும் புதுப்பிக்கப்பட்டுள்ளன. ✓';
    }catch(err){if(status)status.textContent='சேமிக்க முடியவில்லை: '+(err.message||err);alert(err.message||err);}
    finally{btn.disabled=false;btn.textContent=old;}
  });

  // Post creation and editing always waits for Supabase before reporting success.
  $('adminPostForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('postSubmitBtn');btn.disabled=true;try{const id=$('editingPostId').value;const posts=getStoredPosts();const old=posts.find(p=>String(p.id)===String(id));const norm=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ta').replace(/[\s\p{P}\p{S}]+/gu,'').trim();const enteredTitle=norm($('title').value),enteredContent=norm($('content').value);const duplicate=posts.find(p=>String(p.id)!==String(id)&&((norm(p.title)===enteredTitle&&norm(p.author)===norm($('author').value))||(enteredContent.length>80&&norm(p.content)===enteredContent)));if(duplicate){throw new Error(`இந்தப் படைப்பு ஏற்கெனவே பவிழிதழில் பதிவாகியுள்ளது: “${duplicate.title}” (${duplicate.author}). வேறு படைப்பைச் சமர்ப்பிக்கவும்.`);}const avatarFile=$('authorImageFile').files[0],imageFile=$('postImageFile').files[0];const authorAvatar=avatarFile?await adminReadFile(avatarFile):(old?.authorAvatar||'images/default_author.svg');const image=imageFile?await adminReadFile(imageFile):(old?.image||'');const post={...(old||{}),id:id||makeId('post'),title:$('title').value.trim(),author:$('author').value.trim(),category:$('category').value,authorAvatar,image,content:$('content').value.trim(),date:old?.date||new Date().toLocaleDateString('ta-IN'),createdAt:old?.createdAt||new Date().toISOString()};const i=posts.findIndex(p=>String(p.id)===String(post.id));if(i>=0)posts[i]=post;else posts.unshift(post);await savePosts(posts);e.target.reset();$('editingPostId').value='';$('postSubmitBtn').textContent='படைப்பை வெளியிடு';$('cancelEditBtn').hidden=true;renderAdminPosts();fillQuarterPosts([]);updateAdminStats();alert(id?'படைப்பு திருத்தப்பட்டு Supabase-ல் வெளியிடப்பட்டதாக மீண்டும் சரிபார்க்கப்பட்டது.':'படைப்பு Supabase-ல் சேமிக்கப்பட்டு வெளியிடப்பட்டதாக மீண்டும் சரிபார்க்கப்பட்டது.');}catch(err){alert('படைப்பைச் சேமிக்க முடியவில்லை: '+(err.message||err));}finally{btn.disabled=false;}});
  $('cancelEditBtn').addEventListener('click',()=>{$('adminPostForm').reset();$('editingPostId').value='';$('postSubmitBtn').textContent='படைப்பை வெளியிடு';$('cancelEditBtn').hidden=true;});
  $('backupBtn').addEventListener('click',()=>{const keys=['pavizhidhal_site_settings','pavizhidhal_issue_settings','pavizhidhal_social','pavizhidhal_contest','pavizhidhal_winners','pavizhidhal_quarterly_issues','pavizhidhal_semiannual_awards','pavizhidhal_special_awards','pavizhidhal_annual_contests','pavizhidhal_annual_anthologies','pavizhidhal_certificates','pavizhidhal_certificate_branding'];const data={posts:getStoredPosts(),exportedAt:new Date().toISOString()};keys.forEach(k=>data[k]=safeParseJSON(localStorage.getItem(k),null));const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pavizhidhal-full-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);});
  $('restoreFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!confirm('தற்போதைய உள்ளடக்கங்களை Backup கோப்பிலுள்ளவற்றால் மாற்றவா?'))return;if(Array.isArray(data.posts))await savePosts(data.posts);for(const k of ['pavizhidhal_site_settings','pavizhidhal_issue_settings','pavizhidhal_social','pavizhidhal_contest','pavizhidhal_winners','pavizhidhal_quarterly_issues','pavizhidhal_semiannual_awards','pavizhidhal_special_awards','pavizhidhal_annual_contests','pavizhidhal_annual_anthologies','pavizhidhal_certificates','pavizhidhal_certificate_branding'])if(data[k]!==undefined&&data[k]!==null)await persistPaviSetting(k,data[k]);alert('Backup Supabase-ல் மீட்டமைக்கப்பட்டது.');location.reload();}catch(err){alert('Backup மீட்டமைக்க முடியவில்லை: '+(err.message||err));}});
  renderAdminPosts();updateAdminStats();renderAdminComments();
}

function injectSubmissionNotice(){
  if(document.getElementById('submissionNotice'))return;
  const category=document.body.getAttribute('data-category');if(category==='admin'||category==='about')return;
  const main=document.querySelector('main');if(!main)return;
  const box=document.createElement('section');box.id='submissionNotice';box.className='submission-notice';
  box.innerHTML=`<p class="section-eyebrow">✦ படைப்பாளர்களுக்கு அழைப்பு ✦</p><h2>உங்கள் படைப்பும் பவிழிதழில் மலரட்டும்!</h2><p>எங்கள் தளத்தில் உங்கள் படைப்பை வெளியிட விரும்பினால், தெளிவான யூனிகோட் தமிழ் எழுத்துருவில் தட்டச்சு செய்து அனுப்புங்கள். மின்னஞ்சலின் தலைப்பில் படைப்பின் பெயரையும் வகையையும் (கவிதை, சிறுகதை, கட்டுரை, ஆய்வுக் கட்டுரை, குழந்தை இலக்கியம் போன்றவை) குறிப்பிடுங்கள். அதனுடன் உங்கள் பெயர், ஊர், சுருக்கமான சுயவிவரம் மற்றும் தொடர்பு விவரங்களையும் இணைத்து அனுப்பவும்.</p><p class="submission-email">படைப்புகள்: <a href="mailto:editor.pavizhithazh@gmail.com?subject=பவிழிதழுக்கு%20படைப்பு">editor.pavizhithazh@gmail.com</a></p>`;
  main.appendChild(box);
}
function upgradePublicFooter(){
  const footer=document.querySelector('footer');if(!footer)return;
  const founderHTML='<strong>நிறுவனர் மற்றும் ஒருங்கிணைப்பாளர்:</strong> கவிஞர், எழுத்தாளர் செல்வி இரா.பவித்ரா';
  const isAboutPage=document.body.getAttribute('data-category')==='about';
  const contactHTML=isAboutPage?'<span>பவிழிதழ் குழுவினர்</span><br><strong>பொதுத் தொடர்பு:</strong> <a href="mailto:pavizhithazh@gmail.com">pavizhithazh@gmail.com</a>':'<span>பவிழிதழ் குழுவினர்</span>';
  const direct=[...footer.children];
  let links=direct.find(el=>el.classList&&el.classList.contains('footer-links'))||null;
  if(!links){links=document.createElement('div');links.className='footer-links';links.innerHTML='<a href="about.html">எங்களைப் பற்றி</a><a href="authors.html">எழுத்தாளர்கள்</a><a href="certificates.html">சான்றிதழ்கள்</a>';}
  else if(!links.querySelector('a[href="certificates.html"]')){const certLink=document.createElement('a');certLink.href='certificates.html';certLink.textContent='சான்றிதழ்கள்';links.insertBefore(certLink,links.firstChild);}
  const copyright=direct.filter(el=>el.tagName==='P'&&/©|அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை/.test(el.textContent));
  let founder=direct.find(el=>el.tagName==='P'&&/நிறுவனர்|ஒருங்கிணைப்பாளர்/.test(el.textContent));
  if(!founder){founder=document.createElement('p');}
  founder.className='footer-founder';founder.innerHTML=founderHTML;
  let contact=direct.find(el=>el.tagName==='P'&&(el.classList.contains('footer-contact-standard')||/ஆசிரியர் குழு|பொதுத் தொடர்பு/.test(el.textContent)));
  if(!contact)contact=document.createElement('p');
  contact.className='footer-contact-standard';contact.innerHTML=contactHTML;
  // Remove the marked legacy footer copy and the separate editor mailbox line.
  // The editor address remains available in the dedicated submission section/About page.
  let visitor=document.getElementById('visitorStatsPanel');
  if(!visitor){visitor=document.createElement('section');visitor.id='visitorStatsPanel';visitor.className='visitor-stats-panel';visitor.setAttribute('aria-label','பவிழிதழ் வாசகர் வருகைக் கணக்கு');}
  footer.replaceChildren(founder,contact,...(links?[links]:[]),visitor,...copyright);
}
function updateAdminStats(){const el=document.getElementById('adminStats');if(!el)return;const posts=getStoredPosts();const authors=new Set(posts.map(p=>p.author).filter(Boolean));el.innerHTML=`<div><strong>${posts.length}</strong><span>படைப்புகள்</span></div><div><strong>${authors.size}</strong><span>எழுத்தாளர்கள்</span></div><div><strong>${getSettingCollection('pavizhidhal_quarterly_issues').length}</strong><span>காலாண்டு இதழ்கள்</span></div><div><strong>${getSettingCollection('pavizhidhal_annual_contests').length}</strong><span>போட்டிகள்</span></div><div><strong>${getSettingCollection('pavizhidhal_certificates').length}</strong><span>சான்றிதழ்கள்</span></div>`;}
function renderAdminPosts(){const list=document.getElementById('adminPostsList');if(!list)return;const posts=getStoredPosts();list.innerHTML=posts.length?'':'<div class="post-card">இன்னும் படைப்புகள் இல்லை.</div>';posts.forEach(p=>{const item=document.createElement('article');item.className='post-card admin-post-row';const title=document.createElement('h3');title.textContent=p.title;const meta=document.createElement('p');meta.textContent=`${p.author} · ${getCategoryName(p.category)} · ${p.date||''}`;const edit=document.createElement('button');edit.className='admin-secondary';edit.type='button';edit.textContent='திருத்து';edit.onclick=()=>{document.getElementById('editingPostId').value=p.id;document.getElementById('title').value=p.title||'';document.getElementById('author').value=p.author||'';document.getElementById('category').value=p.category||'kavithai';document.getElementById('content').value=p.content||'';document.getElementById('postSubmitBtn').textContent='மாற்றங்களைச் சேமி';document.getElementById('cancelEditBtn').hidden=false;document.getElementById('postManager').scrollIntoView({behavior:'smooth'});};const del=document.createElement('button');del.className='admin-danger';del.type='button';del.textContent='நீக்கு';del.onclick=()=>adminDeletePost(p.id);const actions=document.createElement('div');actions.className='admin-actions';actions.append(edit,del);item.append(title,meta,actions);list.appendChild(item);});updateAdminStats();}

function renderAdminComments(){const box=document.getElementById('adminCommentsList');if(!box)return;const posts=getStoredPosts();let rows=[];posts.forEach(post=>{const comments=safeParseJSON(localStorage.getItem(`pavizhidhal_comments_${post.id}`),[]);comments.forEach(c=>rows.push({post,c}));});if(!rows.length){box.innerHTML='<div class="post-card">கருத்துகள் இன்னும் இல்லை.</div>';return;}box.innerHTML='';rows.forEach(({post,c})=>{const row=document.createElement('div');row.className='post-card admin-post-row';const p=document.createElement('p');p.textContent=`${c.userName}: ${c.text} · ${post.title}`;const actions=document.createElement('div');actions.className='admin-actions';if(!c.approved){const approve=document.createElement('button');approve.className='admin-primary';approve.textContent='கருத்தை அனுமதி';approve.onclick=async()=>{try{await PaviDB.approveComment(c.id);await PaviDB.loadComments();renderAdminComments();alert('கருத்து வெளியிட அனுமதிக்கப்பட்டது.');}catch(e){alert('அனுமதி வழங்க முடியவில்லை: '+(e.message||e));}};actions.appendChild(approve);}const b=document.createElement('button');b.className='admin-danger';b.textContent='கருத்தை நீக்கு';b.onclick=()=>deleteComment(post.id,c.id);actions.appendChild(b);row.append(p,actions);box.appendChild(row);});}
async function adminDeletePost(id) {
  if(!confirm('இந்தப் படைப்பை நிச்சயமாக நீக்க வேண்டுமா?'))return;
  try{await PaviDB.deletePost(id);const posts=getStoredPosts().filter(p=>String(p.id)!==String(id));localStorage.setItem('pavizhidhal_posts',JSON.stringify(posts));renderAdminPosts();alert('படைப்பு Supabase-லிருந்து நீக்கப்பட்டது.');}
  catch(e){alert('Database-ல் நீக்க முடியவில்லை: '+(e.message||e));}
}
