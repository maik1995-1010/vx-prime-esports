const SUPABASE_URL = 'https://damzsqtlbnfsqmqsezlt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HCMgJ__io6RHvOveihSTeQ_dtyVc9OX';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = {
  session:null, profile:null, member:null,
  members:[], matches:[], matchMaps:[], matchRounds:[], lineups:[],
  mapPool:[], gameModes:[], highlights:[], live:[], news:[], settings:{},
  team:'competitive', adminTab:'members'
};

const adminRoles = new Set(['founder','co_founder','manager','moderator']);
const matchAdminRoles = new Set(['founder','co_founder','manager']);
const siteAdminRoles = new Set(['founder','co_founder']);

function esc(v=''){
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
function fmtDate(v, withTime=true){
  if(!v) return 'TBA';
  const d = new Date(v);
  return new Intl.DateTimeFormat('it-IT',{
    day:'2-digit', month:'short', year:'numeric',
    ...(withTime ? {hour:'2-digit',minute:'2-digit'} : {})
  }).format(d);
}
function toLocalInput(v){
  if(!v) return '';
  const d = new Date(v);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime()-off*60000).toISOString().slice(0,16);
}
function timeAgo(v){
  if(!v) return '';
  const s=(Date.now()-new Date(v))/1000;
  if(s<60)return 'adesso';
  if(s<3600)return `${Math.floor(s/60)} min fa`;
  if(s<86400)return `${Math.floor(s/3600)} h fa`;
  return `${Math.floor(s/86400)} g fa`;
}
function initials(n='VX'){
  return n.split(/[\s._-]+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || 'VX';
}
function toast(msg){
  const t=$('#toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>t.classList.remove('show'),3000);
}
function openModal(html){
  $('#modalContent').innerHTML=html;
  $('#modalShell').classList.add('open');
  $('#modalShell').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeModal(){
  $('#modalShell').classList.remove('open');
  $('#modalShell').setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}
function isAdmin(){ return !!state.profile && adminRoles.has(state.profile.role); }
function isMatchAdmin(){ return !!state.profile && matchAdminRoles.has(state.profile.role); }
function isSiteAdmin(){ return !!state.profile && siteAdminRoles.has(state.profile.role); }

async function safeQuery(promise, fallback=[]){
  const {data,error}=await promise;
  if(error){ console.warn(error); return fallback; }
  return data ?? fallback;
}

function avatarMarkup(m, cls='player-photo'){
  if(m?.avatar_url){
    return `<img class="${cls}" src="${esc(m.avatar_url)}" alt="${esc(m.nickname||'vX PRIME')}" loading="lazy">`;
  }
  return `<div class="player-fallback">${esc(initials(m?.nickname||'VX'))}</div>`;
}

function modeCodeByName(name=''){
  const found=state.gameModes.find(x=>x.name===name || x.code===name);
  return found?.code || '';
}
function modeName(codeOrName=''){
  const found=state.gameModes.find(x=>x.code===codeOrName || x.name===codeOrName);
  return found?.name || codeOrName;
}

async function loadPublic(){
  const [members,matches,maps,rounds,lineups,mapPool,modes,highlights,live,news,settings] = await Promise.all([
    safeQuery(db.from('vx2_members').select('*').eq('is_active',true).order('sort_order',{ascending:true})),
    safeQuery(db.from('vx2_matches').select('*').order('starts_at',{ascending:true})),
    safeQuery(db.from('vx2_match_maps').select('*').order('match_id').order('map_order')),
    safeQuery(db.from('vx2_match_rounds').select('*').order('match_map_id').order('round_number')),
    safeQuery(db.from('vx2_match_lineup').select('*,vx2_members(id,nickname,display_name,avatar_url,player_role,team_group)').order('lineup_role')),
    safeQuery(db.from('vx2_map_pool').select('*').eq('active',true).order('sort_order')),
    safeQuery(db.from('vx2_game_modes').select('*').eq('active',true).order('sort_order')),
    safeQuery(db.from('vx2_highlights').select('*,vx2_members(nickname,avatar_url)').eq('published',true).order('featured',{ascending:false}).order('created_at',{ascending:false})),
    safeQuery(db.from('vx2_live_streams').select('*,vx2_members(nickname,avatar_url)').order('is_live',{ascending:false}).order('updated_at',{ascending:false})),
    safeQuery(db.from('vx2_news').select('*').eq('published',true).order('featured',{ascending:false}).order('published_at',{ascending:false})),
    safeQuery(db.from('vx2_site_settings').select('*'))
  ]);
  Object.assign(state,{members,matches,matchMaps:maps,matchRounds:rounds,lineups,mapPool,gameModes:modes,highlights,live,news});
  state.settings=Object.fromEntries(settings.map(x=>[x.key,x.value]));
  renderAll();
}

function renderAll(){
  renderBrand();
  renderStats();
  renderMatch();
  renderTeam();
  renderLive();
  renderHighlights();
  renderNews();
  renderPulse();
}

function renderBrand(){
  const b=state.settings.brand||{}, h=state.settings.home||{};
  if(h.hero_eyebrow) $('#heroEyebrow').textContent=h.hero_eyebrow;
  if(h.hero_subtitle) $('#heroSubtitle').textContent=h.hero_subtitle;
  document.title=`${b.name||'vX PRIME'} — ${b.tagline||'THIS IS OUR GAME.'}`;
}

function nextFutureMatch(){
  return state.matches
    .filter(m=>['upcoming','live'].includes(m.status) && new Date(m.starts_at)>=new Date(Date.now()-6*3600e3))
    .sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0] || null;
}

function renderStats(){
  const active=state.members.filter(x=>x.team_group!=='community').length;
  const live=state.live.filter(x=>x.is_live).length;
  const upcoming=state.matches.filter(x=>['upcoming','live'].includes(x.status)&&new Date(x.starts_at)>=new Date(Date.now()-6*3600e3)).length;
  const completed=state.matches.filter(x=>x.status==='completed');
  const wins=completed.filter(x=>(x.vx_score??0)>(x.opponent_score??0)).length;
  $('#statPlayers').textContent=active;
  $('#statLive').textContent=String(live).padStart(2,'0');
  $('#statMatches').textContent=String(upcoming).padStart(2,'0');
  $('#statHighlights').textContent=state.highlights.length;
  $('#heroPlayers').textContent=active;
  $('#heroLive').textContent=String(live).padStart(2,'0');
  $('#heroWins').textContent=String(wins).padStart(2,'0');

  const m=nextFutureMatch();
  $('#heroNextMatch').classList.remove('loading-card');
  $('#heroNextMatch').innerHTML = m ? `
    <div class="hero-match-date">${esc(fmtDate(m.starts_at))}</div>
    <div class="hero-match-opponent">vs ${esc(m.opponent_name)}</div>
    <div class="modal-sub">${esc(m.competition||'Competitive')} · BO${esc(m.best_of||3)}</div>
    <div class="hero-match-meta">
      <span class="badge ${m.status==='live'?'red':'green'}">${esc(m.status.toUpperCase())}</span>
      <span class="badge purple">${esc((m.match_type||'competitive').toUpperCase())}</span>
    </div>
  ` : `
    <div class="hero-match-date">MATCH CENTER</div>
    <div class="hero-match-opponent">NO BATTLE</div>
    <div class="modal-sub">Il prossimo match apparirà qui automaticamente.</div>
  `;
}

function matchMapsFor(matchId){ return state.matchMaps.filter(x=>Number(x.match_id)===Number(matchId)).sort((a,b)=>a.map_order-b.map_order); }
function roundsFor(mapId){ return state.matchRounds.filter(x=>Number(x.match_map_id)===Number(mapId)).sort((a,b)=>a.round_number-b.round_number); }
function lineupFor(matchId){ return state.lineups.filter(x=>Number(x.match_id)===Number(matchId)); }

function renderMatch(){
  const m=nextFutureMatch();
  const box=$('#nextMatch');
  box.classList.remove('loading-card');

  if(!m){
    box.innerHTML=`<div class="empty-state"><strong>NO BATTLE SCHEDULED</strong>New matches will appear here automatically.</div>`;
  } else {
    const maps=matchMapsFor(m.id);
    box.innerHTML=`
      <div class="match-hero-head">
        <div>
          <small>${esc(fmtDate(m.starts_at))}</small>
          <div class="kicker" style="margin-top:8px">${esc(m.competition||'MATCH')}</div>
        </div>
        <span class="match-status">${esc(m.status.toUpperCase())}</span>
      </div>
      <div class="match-versus">
        <div class="club-name">vX<br>PRIME</div>
        <div class="vs">VS</div>
        <div class="opponent-name">${esc(m.opponent_name)}</div>
      </div>
      <div class="match-card-meta">
        <span class="chip purple">BO${esc(m.best_of||3)}</span>
        <span class="chip">${esc((m.match_type||'competitive').toUpperCase())}</span>
        ${maps.slice(0,3).map(x=>`<span class="chip cyan">${esc(x.mode)} · ${esc(x.map_name)}</span>`).join('')}
      </div>
    `;
    box.onclick=()=>showMatchDetail(m.id);
  }

  const completed=state.matches.filter(x=>x.status==='completed')
    .sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at)).slice(0,5);
  $('#recentResults').innerHTML=completed.length ? completed.map(x=>{
    const win=(x.vx_score??0)>(x.opponent_score??0);
    const loss=(x.vx_score??0)<(x.opponent_score??0);
    return `<div class="result-row" data-match="${x.id}">
      <div class="result-vs">vX PRIME<strong>vs ${esc(x.opponent_name)}</strong></div>
      <div class="result-score ${win?'win':loss?'loss':''}">${x.vx_score??'-'} : ${x.opponent_score??'-'}</div>
      <div class="result-date">${esc(fmtDate(x.starts_at,false))} · ${esc(x.competition||'MATCH')}</div>
    </div>`;
  }).join('') : `<div class="empty-state"><strong>NO RESULTS YET</strong>The first completed matches will appear here.</div>`;
  $$('[data-match]','#recentResults').forEach(el=>el.onclick=()=>showMatchDetail(el.dataset.match));
}

function renderTeam(){
  const list=state.members.filter(m=>m.team_group===state.team);
  $('#teamCount').textContent=`${list.length} PLAYER${list.length===1?'':'S'}`;
  $('#teamGrid').innerHTML=list.length ? list.slice(0,16).map((m,i)=>`
    <article class="team-card" data-member="${m.id}">
      <div class="player-photo-wrap">${avatarMarkup(m)}</div>
      <span class="card-number">${String(i+1).padStart(2,'0')}</span>
      <div class="player-info">
        <div class="player-group">${esc(m.team_group.toUpperCase())}</div>
        <h3>${esc(m.nickname)}</h3>
        <p>${esc(m.player_role||m.display_name||'vX PRIME member')}</p>
        <span class="profile-arrow">VIEW PROFILE ↗</span>
      </div>
    </article>
  `).join('') : `<div class="empty-state"><strong>COMING SOON</strong>No active members in this group.</div>`;
  $$('[data-member]','#teamGrid').forEach(c=>c.onclick=()=>showMember(c.dataset.member));
}

function renderLive(){
  const active=state.live.filter(x=>x.is_live);
  $('#liveGrid').innerHTML=active.length ? active.map(s=>`
    <a class="live-card" href="${esc(s.stream_url)}" target="_blank" rel="noopener">
      <div class="live-preview">${s.preview_url?`<img src="${esc(s.preview_url)}" alt="">`:''}</div>
      <div class="live-content">
        <div class="live-badge">LIVE · ${esc((s.platform||'stream').toUpperCase())}</div>
        <h3>${esc(s.vx2_members?.nickname||s.title||'vX PRIME')}</h3>
        <p>${esc(s.title||'Watch now')}</p>
      </div>
    </a>
  `).join('') : `<div class="empty-state"><strong>THE ARENA IS QUIET. FOR NOW.</strong>Quando un player vX va live, lo stream appare qui.</div>`;
}

function renderHighlights(){
  $('#highlightRail').innerHTML=state.highlights.length ? state.highlights.slice(0,12).map(h=>`
    <a class="highlight-card" href="${esc(h.video_url)}" target="_blank" rel="noopener">
      ${h.thumbnail_url?`<img src="${esc(h.thumbnail_url)}" alt="${esc(h.title)}" loading="lazy">`:''}
      <span class="play-icon">▶</span>
      <div class="highlight-info">
        <span>${esc(h.vx2_members?.nickname||'vX PRIME')}</span>
        <h3>${esc(h.title)}</h3>
      </div>
    </a>
  `).join('') : `<div class="empty-state"><strong>FIRST CLIPS INCOMING</strong>Approved highlights will appear here.</div>`;
}

function renderNews(){
  $('#newsGrid').innerHTML=state.news.length ? state.news.slice(0,4).map(n=>`
    <article class="news-card">
      <small>${esc(n.category||'NEWS')}</small>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.excerpt||n.body||'')}</p>
    </article>
  `).join('') : `<div class="empty-state"><strong>NO NEWS YET</strong></div>`;
}

function renderPulse(){
  const items=[];
  state.highlights.slice(0,2).forEach(h=>items.push({t:`${h.vx2_members?.nickname||'vX player'} uploaded “${h.title}”`,d:h.created_at}));
  state.matches.slice().sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,2).forEach(m=>items.push({t:`Match vs ${m.opponent_name} ${m.status==='upcoming'?'scheduled':'updated'}`,d:m.updated_at}));
  state.news.slice(0,2).forEach(n=>items.push({t:n.title,d:n.published_at}));
  items.sort((a,b)=>new Date(b.d)-new Date(a.d));
  $('#pulseList').innerHTML=(items.length?items:[{t:'vX PRIME 2.0 is online',d:new Date()}]).slice(0,5)
    .map(i=>`<div class="pulse-item">● ${esc(i.t)}<span>${esc(timeAgo(i.d))}</span></div>`).join('');
}

function showMember(id){
  const m=state.members.find(x=>x.id===id);
  if(!m)return;
  openModal(`
    <div class="modal-kicker">${esc(m.team_group.toUpperCase())} · PLAYER PROFILE</div>
    <h2>${esc(m.nickname)}</h2>
    <div class="profile-hero">
      ${m.avatar_url?`<img src="${esc(m.avatar_url)}" alt="${esc(m.nickname)}">`:`<div class="profile-fallback">${esc(initials(m.nickname))}</div>`}
      <div class="profile-copy">
        <span>${esc(m.team_group.toUpperCase())}</span>
        <h3>${esc(m.display_name||m.nickname)}</h3>
        <p>${esc(m.player_role||'vX PRIME member')}</p>
      </div>
    </div>
    ${m.bio?`<div class="modal-section"><div class="modal-sub">${esc(m.bio)}</div></div>`:''}
  `);
}

function showFullRoster(){
  const groups=['competitive','academy','staff','community'];
  openModal(`
    <div class="modal-kicker">ROSTER</div>
    <h2>vX PRIME TEAM</h2>
    <p class="modal-sub">Tutto il roster, diviso per area.</p>
    ${groups.map(g=>`
      <div class="modal-section">
        <h3>${g.toUpperCase()}</h3>
        <div class="admin-list">
          ${state.members.filter(m=>m.team_group===g).map(m=>`
            <button class="admin-row roster-open" type="button" data-id="${m.id}">
              <div><strong>${esc(m.nickname)}</strong><small>${esc(m.player_role||m.display_name||'')}</small></div>
              <span>↗</span>
            </button>`).join('')||'<div class="modal-sub">Empty.</div>'}
        </div>
      </div>
    `).join('')}
  `);
  $$('.roster-open').forEach(b=>b.onclick=()=>showMember(b.dataset.id));
}

async function showMatches(){
  openModal(`
    <div class="modal-kicker">MATCH CENTER</div>
    <h2>ALL MATCHES</h2>
    <p class="modal-sub">Calendario, risultati, mappe, modalità, lineup e round.</p>
    <div class="match-list">
      ${state.matches.slice().sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at)).map(m=>{
        const maps=matchMapsFor(m.id);
        return `<article class="match-list-card">
          <div class="match-list-head">
            <div>
              <span class="badge ${m.status==='live'?'red':m.status==='completed'?'green':'purple'}">${esc(m.status.toUpperCase())}</span>
              <h3>vX PRIME vs ${esc(m.opponent_name)}</h3>
              <div class="modal-sub">${esc(fmtDate(m.starts_at))} · BO${esc(m.best_of||3)} · ${esc(m.competition||'MATCH')}</div>
            </div>
            <div class="match-list-score">${m.vx_score??'-'} : ${m.opponent_score??'-'}</div>
          </div>
          <div class="match-map-list">
            ${maps.map(mp=>`<div class="match-map-row">
              <span class="map-number">${mp.map_order}</span>
              <div class="map-copy"><strong>${esc(mp.map_name)}</strong><small>${esc(mp.mode)}</small></div>
              <span class="map-score">${mp.vx_score??'-'} : ${mp.opponent_score??'-'}</span>
            </div>`).join('')||'<div class="modal-sub">Mappe non ancora definite.</div>'}
          </div>
          <div class="form-actions"><button class="mini-btn primary public-match-detail" data-id="${m.id}">DETAILS</button></div>
        </article>`;
      }).join('') || '<div class="empty-state"><strong>NO MATCHES</strong></div>'}
    </div>
  `);
  $$('.public-match-detail').forEach(b=>b.onclick=()=>showMatchDetail(b.dataset.id));
}

function showMatchDetail(id){
  const m=state.matches.find(x=>Number(x.id)===Number(id));
  if(!m)return;
  const maps=matchMapsFor(id);
  const lineup=lineupFor(id);
  openModal(`
    <div class="modal-kicker">${esc(m.competition||'MATCH')} · ${esc(m.status.toUpperCase())}</div>
    <h2>vX PRIME<br>vs ${esc(m.opponent_name)}</h2>
    <p class="modal-sub">${esc(fmtDate(m.starts_at))} · BO${esc(m.best_of||3)} · ${esc((m.match_type||'competitive').toUpperCase())}</p>

    <div class="modal-section">
      <div class="match-list-head">
        <h3>SERIES SCORE</h3>
        <div class="match-list-score">${m.vx_score??'-'} : ${m.opponent_score??'-'}</div>
      </div>
    </div>

    <div class="modal-section">
      <h3>MAPS & MODES</h3>
      <div class="match-map-list">
        ${maps.map(mp=>{
          const rs=roundsFor(mp.id);
          return `<div class="admin-map-card">
            <div class="admin-map-head">
              <div>
                <span class="badge cyan">MAP ${mp.map_order}</span>
                <h3>${esc(mp.map_name)}</h3>
                <div class="modal-sub">${esc(mp.mode)}</div>
              </div>
              <div class="match-list-score">${mp.vx_score??'-'} : ${mp.opponent_score??'-'}</div>
            </div>
            ${rs.length?`<div class="modal-section">
              ${rs.map(r=>`<div class="match-map-row">
                <span class="map-number">${r.round_number}</span>
                <div class="map-copy"><strong>Round ${r.round_number}</strong><small>${esc(r.note||'')}</small></div>
                <span class="map-score">${r.vx_score} : ${r.opponent_score}</span>
              </div>`).join('')}
            </div>`:''}
          </div>`;
        }).join('')||'<div class="modal-sub">Mappe non ancora definite.</div>'}
      </div>
    </div>

    <div class="modal-section">
      <h3>LINEUP</h3>
      <div class="lineup-grid">
        ${lineup.map(l=>`<div class="lineup-chip">
          <strong>${esc(l.vx2_members?.nickname||'vX player')}</strong>
          <small>${esc((l.lineup_role||'starter').toUpperCase())}</small>
        </div>`).join('')||'<div class="modal-sub">Lineup non ancora pubblicata.</div>'}
      </div>
    </div>

    ${m.stream_url?`<div class="form-actions"><a class="btn primary" href="${esc(m.stream_url)}" target="_blank" rel="noopener">WATCH STREAM ↗</a></div>`:''}
  `);
}

async function refreshAuth(){
  const {data:{session}}=await db.auth.getSession();
  state.session=session;
  state.profile=null;
  state.member=null;
  if(session){
    const loginAt=Number(localStorage.getItem('vx2_login_at')||Date.now());
    if(Date.now()-loginAt>6*3600e3){
      await db.auth.signOut();
      localStorage.removeItem('vx2_login_at');
      state.session=null;
      toast('Sessione scaduta');
    } else {
      const {data:p}=await db.from('profiles').select('id,email,nickname,status,role,permissions').eq('id',session.user.id).maybeSingle();
      state.profile=p||null;
      const {data:m}=await db.from('vx2_members').select('*').eq('user_id',session.user.id).maybeSingle();
      state.member=m||null;
    }
  }
  updateAuthUI();
}

function updateAuthUI(){
  const b=$('#accountBtn');
  b.textContent=state.session?(state.member?.nickname||state.profile?.nickname||'ACCOUNT'):'ACCEDI';
  $('#adminMenuLink').classList.toggle('hidden',!isAdmin());
}

function showAccount(){
  if(!state.session) return showAuth();
  const p=state.profile,m=state.member;
  openModal(`
    <div class="modal-kicker">ACCOUNT</div>
    <h2>${esc(m?.nickname||p?.nickname||'MY ACCOUNT')}</h2>
    <p class="modal-sub">${esc(p?.email||state.session.user.email||'')} · ${esc((p?.role||'member').toUpperCase())}</p>
    <div class="modal-section">
      <h3>${esc(m?.display_name||m?.nickname||p?.nickname||'vX member')}</h3>
      <p class="modal-sub">Status: ${esc(p?.status||'pending')}</p>
      ${m?`<p class="modal-sub">${esc(m.player_role||'')}</p>`:'<p class="modal-sub">Il tuo account non è ancora collegato a un profilo roster.</p>'}
    </div>
    <div class="form-actions">
      <a class="mini-btn primary" href="/game/">GIOCA</a>
      ${m?'<button class="mini-btn" id="editProfileBtn">EDIT PROFILE</button>':''}
      ${isAdmin()?'<button class="mini-btn" id="openAdminBtn">OPEN ADMIN</button>':''}
      <button class="mini-btn danger" id="logoutBtn">LOGOUT</button>
    </div>
  `);
  $('#logoutBtn').onclick=async()=>{await db.auth.signOut();localStorage.removeItem('vx2_login_at');closeModal();await refreshAuth();toast('Logout effettuato');};
  if($('#openAdminBtn')) $('#openAdminBtn').onclick=showAdmin;
  if($('#editProfileBtn')) $('#editProfileBtn').onclick=showProfileEditor;
}

function showAuth(){
  openModal(`
    <div class="modal-kicker">MEMBER ACCESS</div>
    <h2>ENTER PRIME.</h2>
    <div class="auth-tabs">
      <button class="active" type="button" data-auth="login">LOGIN</button>
      <button type="button" data-auth="signup">REGISTER</button>
    </div>
    <form id="authForm">
      <div class="form-grid">
        <div class="field full"><label>EMAIL</label><input name="email" type="email" autocomplete="email" required></div>
        <div class="field full"><label>PASSWORD</label><input name="password" type="password" minlength="8" autocomplete="current-password" required></div>
        <div class="field full hidden" id="nickField"><label>NICKNAME</label><input name="nickname" minlength="2" maxlength="40" placeholder="vX.Nickname"></div>
      </div>
      <p class="form-note" id="authHint">Accedi con l'email usata per il tuo account vX PRIME.</p>
      <div class="form-actions"><button class="btn primary" type="submit" id="authSubmit">CONTINUE ↗</button></div>
    </form>
  `);
  let mode='login';
  $$('.auth-tabs button').forEach(btn=>btn.onclick=()=>{
    mode=btn.dataset.auth;
    $$('.auth-tabs button').forEach(x=>x.classList.toggle('active',x===btn));
    $('#nickField').classList.toggle('hidden',mode!=='signup');
    $('[name="nickname"]').required=mode==='signup';
    $('[name="password"]').autocomplete=mode==='signup'?'new-password':'current-password';
    $('#authHint').textContent=mode==='signup'
      ? 'Dopo la registrazione potresti dover confermare l’email e attendere l’approvazione dello staff.'
      : 'Accedi con l’email usata per il tuo account vX PRIME.';
  });
  $('#authForm').onsubmit=async e=>{
    e.preventDefault();
    const btn=$('#authSubmit'); btn.disabled=true; btn.textContent='WORKING…';
    const f=new FormData(e.currentTarget);
    const email=String(f.get('email')||'').trim();
    const password=String(f.get('password')||'');
    const nickname=String(f.get('nickname')||'').trim();
    let res;
    if(mode==='login') res=await db.auth.signInWithPassword({email,password});
    else res=await db.auth.signUp({email,password,options:{data:{nickname}}});
    btn.disabled=false;btn.textContent='CONTINUE ↗';
    if(res.error)return toast(res.error.message);
    if(res.data.session){
      localStorage.setItem('vx2_login_at',Date.now());
      closeModal();await refreshAuth();toast(mode==='login'?'Bentornato in PRIME':'Account creato');
    } else if(mode==='signup'){
      toast('Account creato: controlla la tua email per confermarlo.');
      closeModal();
    }
  };
}

function showProfileEditor(){
  const m=state.member;if(!m)return;
  openModal(`
    <div class="modal-kicker">PROFILE</div>
    <h2>EDIT PROFILE</h2>
    <form id="profileForm">
      <div class="form-grid">
        <div class="field full"><label>PROFILE PHOTO</label><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></div>
        <div class="field full"><label>DISPLAY NAME</label><input name="display_name" value="${esc(m.display_name||'')}"></div>
        <div class="field full"><label>BIO</label><textarea name="bio">${esc(m.bio||'')}</textarea></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">SAVE PROFILE ↗</button></div>
    </form>
  `);
  $('#profileForm').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    let avatar_url=m.avatar_url;
    const file=f.get('avatar');
    if(file&&file.size){
      const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
      const path=`avatars/${state.session.user.id}/${Date.now()}.${ext}`;
      const up=await db.storage.from('vx2-media').upload(path,file,{upsert:false,cacheControl:'3600'});
      if(up.error)return toast(up.error.message);
      avatar_url=db.storage.from('vx2-media').getPublicUrl(path).data.publicUrl;
    }
    const {error}=await db.rpc('vx2_update_my_profile',{
      next_display_name:f.get('display_name'),
      next_bio:f.get('bio'),
      next_avatar_url:avatar_url
    });
    if(error)return toast(error.message);
    closeModal();await Promise.all([refreshAuth(),loadPublic()]);toast('Profilo aggiornato');
  };
}

function showApplication(){
  if(!state.session){toast('Accedi prima di inviare la candidatura');return showAuth();}
  openModal(`
    <div class="modal-kicker">JOIN vX</div>
    <h2>START APPLICATION</h2>
    <p class="modal-sub">La candidatura verrà salvata nel Control Center e riceverai gli aggiornamenti previsti dal sistema.</p>
    <form id="applicationForm">
      <div class="form-grid">
        <div class="field"><label>PATH</label><select name="application_type" required>
          <option value="competitive">Competitive Player</option>
          <option value="academy">Academy</option>
          <option value="creator">Content Creator</option>
          <option value="staff">Staff</option>
        </select></div>
        <div class="field"><label>NICKNAME</label><input name="nickname" value="${esc(state.member?.nickname||state.profile?.nickname||'')}" required></div>
        <div class="field"><label>REAL NAME</label><input name="real_name"></div>
        <div class="field"><label>CONTACT</label><input name="contact" placeholder="Discord / Telegram / telefono" required></div>
        <div class="field full"><label>EXPERIENCE</label><textarea name="experience"></textarea></div>
        <div class="field full"><label>NOTES</label><textarea name="notes"></textarea></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">SUBMIT ↗</button></div>
    </form>
  `);
  $('#applicationForm').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.currentTarget));
    const {error}=await db.from('vx2_applications').insert({...f,user_id:state.session.user.id,status:'received'});
    if(error)return toast(error.message);
    closeModal();toast('Candidatura inviata');
  };
}

async function showAdmin(){
  if(!isAdmin())return toast('Accesso Admin non autorizzato');
  state.adminTab='members';
  openModal(`
    <div class="modal-kicker">CONTROL CENTER</div>
    <h2>ADMIN 3.0</h2>
    <p class="modal-sub">Gestisci roster, foto profilo, match, mappe, round, lineup, candidature e contenuti senza modificare codice.</p>
    <div class="admin-nav" id="adminNav">
      <button class="active" data-tab="members">PLAYERS</button>
      <button data-tab="matches">MATCHES</button>
      <button data-tab="applications">TRIALS</button>
      <button data-tab="live">LIVE</button>
      <button data-tab="highlights">CLIPS</button>
      <button data-tab="news">NEWS</button>
      ${isSiteAdmin()?'<button data-tab="settings">SETTINGS</button>':''}
    </div>
    <div id="adminBody"></div>
  `);
  $$('#adminNav button').forEach(b=>b.onclick=()=>{state.adminTab=b.dataset.tab;renderAdmin();});
  await renderAdmin();
}

async function renderAdmin(){
  $$('#adminNav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.adminTab));
  const body=$('#adminBody'); if(!body)return;
  body.innerHTML='<div class="empty-state"><strong>LOADING…</strong></div>';

  if(state.adminTab==='members'){
    const rows=await safeQuery(db.from('vx2_members').select('*').order('sort_order'));
    body.innerHTML=`
      <div class="form-actions"><button class="mini-btn primary" id="addMember">+ ADD PLAYER</button></div>
      <div class="admin-list" style="margin-top:14px">
        ${rows.map(x=>adminRow(x.nickname,`${x.team_group} · ${x.player_role||''}${x.avatar_url?' · PHOTO ✓':' · NO PHOTO'}`,x.id,true)).join('')}
      </div>`;
    $('#addMember').onclick=()=>editMember();
    bindAdminRows(rows,editMember,'vx2_members',true);
  }

  if(state.adminTab==='matches'){
    const rows=await safeQuery(db.from('vx2_matches').select('*').order('starts_at',{ascending:false}));
    body.innerHTML=`
      ${isMatchAdmin()?'<div class="form-actions"><button class="mini-btn primary" id="addMatch">+ ADD MATCH</button></div>':''}
      <div class="admin-list" style="margin-top:14px">
        ${rows.map(x=>adminRow(`vs ${x.opponent_name}`,`${fmtDate(x.starts_at)} · ${x.status} · ${x.vx_score??'-'}:${x.opponent_score??'-'}`,x.id,isMatchAdmin(),true)).join('')}
      </div>`;
    if($('#addMatch'))$('#addMatch').onclick=()=>editMatch();
    $$('.edit-row').forEach(b=>b.onclick=()=>editMatch(rows.find(x=>String(x.id)===String(b.dataset.id))));
    $$('.manage-row').forEach(b=>b.onclick=()=>manageMatch(b.dataset.id));
    if(isMatchAdmin())$$('.delete-row').forEach(b=>b.onclick=async()=>{
      if(!confirm('Eliminare questo match e i relativi dettagli?'))return;
      const {error}=await db.from('vx2_matches').delete().eq('id',b.dataset.id);
      if(error)return toast(error.message);
      await loadPublic();showAdmin();toast('Match eliminato');
    });
  }

  if(state.adminTab==='applications'){
    const rows=await safeQuery(db.from('vx2_applications').select('*').order('created_at',{ascending:false}));
    body.innerHTML=`<div class="admin-list">${rows.map(x=>adminRow(x.nickname,`${x.application_type} · ${x.status}`,x.id,false)).join('')}</div>`;
    $$('.edit-row').forEach(b=>b.onclick=()=>editApplication(rows.find(x=>String(x.id)===String(b.dataset.id))));
  }

  if(state.adminTab==='live'){
    const rows=await safeQuery(db.from('vx2_live_streams').select('*,vx2_members(nickname)').order('updated_at',{ascending:false}));
    body.innerHTML=`<div class="form-actions"><button class="mini-btn primary" id="addLive">+ ADD STREAM</button></div>
      <div class="admin-list" style="margin-top:14px">${rows.map(x=>adminRow(x.vx2_members?.nickname||x.title,`${x.platform} · ${x.is_live?'LIVE':'OFFLINE'}`,x.id,true)).join('')}</div>`;
    $('#addLive').onclick=()=>editLive();
    bindAdminRows(rows,editLive,'vx2_live_streams',true);
  }

  if(state.adminTab==='highlights'){
    const rows=await safeQuery(db.from('vx2_highlights').select('*').order('created_at',{ascending:false}));
    body.innerHTML=`<div class="form-actions"><button class="mini-btn primary" id="addClip">+ ADD CLIP</button></div>
      <div class="admin-list" style="margin-top:14px">${rows.map(x=>adminRow(x.title,`${x.published?'published':'draft'}${x.featured?' · featured':''}`,x.id,true)).join('')}</div>`;
    $('#addClip').onclick=()=>editHighlight();
    bindAdminRows(rows,editHighlight,'vx2_highlights',true);
  }

  if(state.adminTab==='news'){
    const rows=await safeQuery(db.from('vx2_news').select('*').order('created_at',{ascending:false}));
    body.innerHTML=`<div class="form-actions"><button class="mini-btn primary" id="addNews">+ ADD NEWS</button></div>
      <div class="admin-list" style="margin-top:14px">${rows.map(x=>adminRow(x.title,`${x.category||'NEWS'} · ${x.published?'published':'draft'}`,x.id,true)).join('')}</div>`;
    $('#addNews').onclick=()=>editNews();
    bindAdminRows(rows,editNews,'vx2_news',true);
  }

  if(state.adminTab==='settings'){
    const rows=await safeQuery(db.from('vx2_site_settings').select('*'));
    body.innerHTML=`<div class="admin-list">${rows.map(x=>adminRow(x.key,JSON.stringify(x.value),x.key,false)).join('')}</div>`;
    $$('.edit-row').forEach(b=>b.onclick=()=>editSettings(rows.find(x=>x.key===b.dataset.id)));
  }
}

function adminRow(title,sub,id,canDelete=false,manage=false){
  return `<div class="admin-row">
    <div><strong>${esc(title)}</strong><small>${esc(sub)}</small></div>
    <div class="row-actions">
      ${manage?`<button class="mini-btn primary manage-row" data-id="${esc(id)}">MAPS / ROUNDS</button>`:''}
      <button class="mini-btn edit-row" data-id="${esc(id)}">EDIT</button>
      ${canDelete?`<button class="mini-btn danger delete-row" data-id="${esc(id)}">DELETE</button>`:''}
    </div>
  </div>`;
}

function bindAdminRows(rows,editor,table,allowDelete){
  $$('.edit-row').forEach(b=>b.onclick=()=>editor(rows.find(x=>String(x.id)===String(b.dataset.id))));
  if(allowDelete)$$('.delete-row').forEach(b=>b.onclick=async()=>{
    if(!confirm('Delete this item?'))return;
    const {error}=await db.from(table).delete().eq('id',b.dataset.id);
    if(error)return toast(error.message);
    await loadPublic();showAdmin();toast('Deleted');
  });
}

async function uploadAdminAvatar(memberId,file){
  if(!file||!file.size)return null;
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`avatars/admin/${memberId}/${Date.now()}.${ext}`;
  const up=await db.storage.from('vx2-media').upload(path,file,{upsert:false,cacheControl:'3600'});
  if(up.error)throw up.error;
  return db.storage.from('vx2-media').getPublicUrl(path).data.publicUrl;
}

function editMember(x={}){
  openModal(`
    <div class="modal-kicker">ADMIN · PLAYER</div>
    <h2>${x.id?'EDIT':'ADD'} PLAYER</h2>
    <form id="editMemberForm">
      <div class="form-grid">
        <div class="field"><label>NICKNAME</label><input name="nickname" value="${esc(x.nickname||'')}" required></div>
        <div class="field"><label>DISPLAY NAME</label><input name="display_name" value="${esc(x.display_name||'')}"></div>
        <div class="field"><label>GROUP</label><select name="team_group">${['competitive','academy','staff','community'].map(v=>`<option value="${v}" ${x.team_group===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>ROLE</label><input name="player_role" value="${esc(x.player_role||'')}"></div>
        <div class="field full"><label>PROFILE PHOTO</label><input name="avatar_file" type="file" accept="image/jpeg,image/png,image/webp"><small class="form-note">${x.avatar_url?'Foto attuale presente. Caricane una nuova per sostituirla.':'Nessuna foto: verranno mostrate le iniziali finché non ne carichi una.'}</small></div>
        <div class="field full"><label>AVATAR URL</label><input name="avatar_url" value="${esc(x.avatar_url||'')}" placeholder="Oppure incolla un URL immagine"></div>
        <div class="field full"><label>BIO</label><textarea name="bio">${esc(x.bio||'')}</textarea></div>
        <div class="field"><label>SORT ORDER</label><input name="sort_order" type="number" value="${esc(x.sort_order??999)}"></div>
        <div class="field"><label>FEATURED</label><select name="featured"><option value="false">No</option><option value="true" ${x.featured?'selected':''}>Yes</option></select></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">SAVE PLAYER ↗</button></div>
    </form>
  `);
  $('#editMemberForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const base={
      nickname:String(fd.get('nickname')||'').trim(),
      display_name:String(fd.get('display_name')||'').trim()||null,
      team_group:fd.get('team_group'),
      player_role:String(fd.get('player_role')||'').trim()||null,
      avatar_url:String(fd.get('avatar_url')||'').trim()||null,
      bio:String(fd.get('bio')||'').trim()||null,
      sort_order:Number(fd.get('sort_order')||999),
      featured:fd.get('featured')==='true',
      is_active:true,
      updated_at:new Date().toISOString()
    };
    let row=x;
    if(x.id){
      const {data,error}=await db.from('vx2_members').update(base).eq('id',x.id).select().single();
      if(error)return toast(error.message); row=data;
    }else{
      const {data,error}=await db.from('vx2_members').insert(base).select().single();
      if(error)return toast(error.message); row=data;
    }
    const file=fd.get('avatar_file');
    if(file&&file.size){
      try{
        const url=await uploadAdminAvatar(row.id,file);
        const {error}=await db.from('vx2_members').update({avatar_url:url,updated_at:new Date().toISOString()}).eq('id',row.id);
        if(error)return toast(error.message);
      }catch(err){return toast(err.message||'Errore upload foto');}
    }
    closeModal();await loadPublic();showAdmin();toast('Player salvato');
  };
}

function editMatch(x={}){
  openModal(`
    <div class="modal-kicker">ADMIN · MATCH</div>
    <h2>${x.id?'EDIT':'ADD'} MATCH</h2>
    <form id="editMatchForm">
      <div class="form-grid">
        <div class="field full"><label>OPPONENT</label><input name="opponent_name" value="${esc(x.opponent_name||'')}" required></div>
        <div class="field"><label>COMPETITION</label><input name="competition" value="${esc(x.competition||'')}"></div>
        <div class="field"><label>TYPE</label><select name="match_type">${['competitive','scrim','tournament'].map(v=>`<option value="${v}" ${x.match_type===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>START</label><input name="starts_at" type="datetime-local" value="${esc(toLocalInput(x.starts_at))}" required></div>
        <div class="field"><label>STATUS</label><select name="status">${['upcoming','live','completed','cancelled'].map(v=>`<option value="${v}" ${x.status===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>BEST OF</label><select name="best_of">${[1,3,5,7].map(v=>`<option value="${v}" ${Number(x.best_of||3)===v?'selected':''}>BO${v}</option>`).join('')}</select></div>
        <div class="field"><label>MVP</label><select name="mvp_member_id"><option value="">None</option>${memberOptions(x.mvp_member_id)}</select></div>
        <div class="field full"><label>STREAM URL</label><input name="stream_url" type="url" value="${esc(x.stream_url||'')}"></div>
        <div class="field full"><label>NOTES</label><textarea name="notes">${esc(x.notes||'')}</textarea></div>
      </div>
      <p class="form-note">Il punteggio della serie viene aggiornato automaticamente dai vincitori delle singole mappe.</p>
      <div class="form-actions"><button class="btn primary" type="submit">SAVE & MANAGE MAPS ↗</button></div>
    </form>
  `);
  $('#editMatchForm').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.currentTarget));
    f.starts_at=new Date(f.starts_at).toISOString();
    f.best_of=Number(f.best_of||3);
    f.mvp_member_id=f.mvp_member_id||null;
    f.stream_url=f.stream_url||null;
    f.notes=f.notes||null;
    f.updated_at=new Date().toISOString();
    let row;
    if(x.id){
      const {data,error}=await db.from('vx2_matches').update(f).eq('id',x.id).select().single();
      if(error)return toast(error.message);row=data;
    }else{
      const {data,error}=await db.from('vx2_matches').insert(f).select().single();
      if(error)return toast(error.message);row=data;
    }
    await loadPublic();manageMatch(row.id);toast('Match salvato');
  };
}

function memberOptions(selected=''){
  return state.members.map(m=>`<option value="${m.id}" ${String(selected)===String(m.id)?'selected':''}>${esc(m.nickname)}</option>`).join('');
}

async function manageMatch(id){
  if(!isMatchAdmin())return toast('Permessi match insufficienti');
  await loadPublic();
  const m=state.matches.find(x=>Number(x.id)===Number(id));
  if(!m)return toast('Match non trovato');
  const maps=matchMapsFor(id), lineup=lineupFor(id);
  openModal(`
    <div class="modal-kicker">ADMIN · MATCH BUILDER</div>
    <h2>vs ${esc(m.opponent_name)}</h2>
    <p class="modal-sub">${esc(fmtDate(m.starts_at))} · BO${m.best_of||3} · Series ${m.vx_score??0}:${m.opponent_score??0}</p>

    <div class="modal-section">
      <div class="admin-map-head">
        <h3>MAPS & MODES</h3>
        <button class="mini-btn primary" id="addMap">+ ADD MAP</button>
      </div>
      <div class="admin-match-shell" style="margin-top:12px">
        ${maps.map(mp=>`
          <div class="admin-map-card">
            <div class="admin-map-head">
              <div>
                <span class="badge cyan">MAP ${mp.map_order}</span>
                <strong style="display:block;margin-top:8px">${esc(mp.map_name)} · ${esc(mp.mode)}</strong>
                <small class="modal-sub">${mp.vx_score??'-'} : ${mp.opponent_score??'-'} · ${esc((mp.winner||'pending').toUpperCase())}</small>
              </div>
              <div class="row-actions">
                <button class="mini-btn rounds-map" data-id="${mp.id}">ROUNDS</button>
                <button class="mini-btn edit-map" data-id="${mp.id}">EDIT</button>
                <button class="mini-btn danger delete-map" data-id="${mp.id}">DELETE</button>
              </div>
            </div>
          </div>`).join('')||'<div class="modal-sub">Nessuna mappa configurata.</div>'}
      </div>
    </div>

    <div class="modal-section">
      <div class="admin-map-head">
        <h3>LINEUP</h3>
        <button class="mini-btn primary" id="addLineup">+ ADD PLAYER</button>
      </div>
      <div class="lineup-grid" style="margin-top:12px">
        ${lineup.map(l=>`<div class="lineup-chip">
          <strong>${esc(l.vx2_members?.nickname||'vX player')}</strong>
          <small>${esc((l.lineup_role||'starter').toUpperCase())}</small>
          <button class="mini-btn danger delete-lineup" data-member="${l.member_id}" style="margin-top:8px">REMOVE</button>
        </div>`).join('')||'<div class="modal-sub">Lineup non configurata.</div>'}
      </div>
    </div>

    <div class="form-actions">
      <button class="mini-btn" id="backAdmin">← ADMIN</button>
      <button class="mini-btn" id="publicPreview">PUBLIC PREVIEW</button>
    </div>
  `);
  $('#addMap').onclick=()=>editMatchMap(m.id);
  $$('.edit-map').forEach(b=>b.onclick=()=>editMatchMap(m.id,maps.find(x=>String(x.id)===String(b.dataset.id))));
  $$('.rounds-map').forEach(b=>b.onclick=()=>manageRounds(m.id,b.dataset.id));
  $$('.delete-map').forEach(b=>b.onclick=async()=>{
    if(!confirm('Eliminare questa mappa?'))return;
    const {error}=await db.from('vx2_match_maps').delete().eq('id',b.dataset.id);
    if(error)return toast(error.message);
    manageMatch(m.id);
  });
  $('#addLineup').onclick=()=>editLineup(m.id);
  $$('.delete-lineup').forEach(b=>b.onclick=async()=>{
    const {error}=await db.from('vx2_match_lineup').delete().eq('match_id',m.id).eq('member_id',b.dataset.member);
    if(error)return toast(error.message);
    manageMatch(m.id);
  });
  $('#backAdmin').onclick=showAdmin;
  $('#publicPreview').onclick=()=>showMatchDetail(m.id);
}

function editMatchMap(matchId,x={}){
  const nextOrder=x.map_order || Math.min(matchMapsFor(matchId).length+1,7);
  openModal(`
    <div class="modal-kicker">MATCH BUILDER · MAP</div>
    <h2>${x.id?'EDIT':'ADD'} MAP</h2>
    <form id="mapForm">
      <div class="form-grid">
        <div class="field"><label>MAP ORDER</label><input name="map_order" type="number" min="1" max="7" value="${esc(nextOrder)}" required></div>
        <div class="field"><label>MODE</label><select name="mode" id="modeSelect" required>
          ${state.gameModes.map(md=>`<option value="${esc(md.name)}" ${x.mode===md.name?'selected':''}>${esc(md.name)}</option>`).join('')}
        </select></div>
        <div class="field full"><label>MAP</label><select name="map_name" id="mapSelect" required></select></div>
        <div class="field"><label>vX SCORE</label><input name="vx_score" type="number" min="0" value="${esc(x.vx_score??'')}"></div>
        <div class="field"><label>OPP SCORE</label><input name="opponent_score" type="number" min="0" value="${esc(x.opponent_score??'')}"></div>
        <div class="field full"><label>WINNER</label><select name="winner">
          <option value="">Pending</option>
          <option value="vx" ${x.winner==='vx'?'selected':''}>vX PRIME</option>
          <option value="opponent" ${x.winner==='opponent'?'selected':''}>Opponent</option>
          <option value="draw" ${x.winner==='draw'?'selected':''}>Draw</option>
        </select></div>
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit">SAVE MAP ↗</button>
        <button class="mini-btn" type="button" id="cancelMap">CANCEL</button>
      </div>
    </form>
  `);
  const fillMaps=()=>{
    const selectedMode=$('#modeSelect').value;
    const code=modeCodeByName(selectedMode);
    const eligible=state.mapPool.filter(mp=>!mp.supported_modes?.length || mp.supported_modes.includes(code));
    $('#mapSelect').innerHTML=eligible.map(mp=>`<option value="${esc(mp.map_name)}" ${x.map_name===mp.map_name?'selected':''}>${esc(mp.map_name)}</option>`).join('');
    if(x.map_name && !eligible.some(mp=>mp.map_name===x.map_name)){
      $('#mapSelect').insertAdjacentHTML('beforeend',`<option value="${esc(x.map_name)}" selected>${esc(x.map_name)}</option>`);
    }
  };
  $('#modeSelect').onchange=fillMaps;fillMaps();
  $('#cancelMap').onclick=()=>manageMatch(matchId);
  $('#mapForm').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.currentTarget));
    f.match_id=Number(matchId);f.map_order=Number(f.map_order);
    f.vx_score=f.vx_score===''?null:Number(f.vx_score);
    f.opponent_score=f.opponent_score===''?null:Number(f.opponent_score);
    f.winner=f.winner||null;
    let q=x.id?db.from('vx2_match_maps').update(f).eq('id',x.id):db.from('vx2_match_maps').insert(f);
    const {error}=await q;if(error)return toast(error.message);
    await loadPublic();manageMatch(matchId);toast('Mappa salvata');
  };
}

async function manageRounds(matchId,mapId){
  await loadPublic();
  const mp=state.matchMaps.find(x=>Number(x.id)===Number(mapId));
  const rows=roundsFor(mapId);
  if(!mp)return toast('Mappa non trovata');
  openModal(`
    <div class="modal-kicker">MATCH BUILDER · ROUNDS</div>
    <h2>${esc(mp.map_name)}</h2>
    <p class="modal-sub">${esc(mp.mode)} · Map ${mp.map_order}</p>
    <form id="roundForm">
      <div class="form-grid">
        <div class="field"><label>ROUND</label><input name="round_number" type="number" min="1" value="${rows.length+1}" required></div>
        <div class="field"><label>WINNER</label><select name="winner"><option value="">Pending</option><option value="vx">vX PRIME</option><option value="opponent">Opponent</option><option value="draw">Draw</option></select></div>
        <div class="field"><label>vX SCORE</label><input name="vx_score" type="number" min="0" value="0" required></div>
        <div class="field"><label>OPP SCORE</label><input name="opponent_score" type="number" min="0" value="0" required></div>
        <div class="field full"><label>NOTE</label><input name="note" placeholder="Es. clutch, side switch, overtime…"></div>
      </div>
      <div class="form-actions"><button class="mini-btn primary" type="submit">+ SAVE ROUND</button><button class="mini-btn" type="button" id="backMatch">← MAPS</button></div>
    </form>

    <div class="modal-section">
      <h3>ROUND HISTORY</h3>
      <div class="admin-list">
        ${rows.map(r=>`<div class="admin-row">
          <div><strong>Round ${r.round_number} · ${r.vx_score}:${r.opponent_score}</strong><small>${esc((r.winner||'pending').toUpperCase())}${r.note?' · '+esc(r.note):''}</small></div>
          <div class="row-actions"><button class="mini-btn danger delete-round" data-id="${r.id}">DELETE</button></div>
        </div>`).join('')||'<div class="modal-sub">Nessun round registrato.</div>'}
      </div>
    </div>
  `);
  $('#backMatch').onclick=()=>manageMatch(matchId);
  $('#roundForm').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.currentTarget));
    f.match_map_id=Number(mapId);f.round_number=Number(f.round_number);
    f.vx_score=Number(f.vx_score||0);f.opponent_score=Number(f.opponent_score||0);
    f.winner=f.winner||null;f.note=f.note||null;
    const {error}=await db.from('vx2_match_rounds').upsert(f,{onConflict:'match_map_id,round_number'});
    if(error)return toast(error.message);
    manageRounds(matchId,mapId);toast('Round salvato');
  };
  $$('.delete-round').forEach(b=>b.onclick=async()=>{
    const {error}=await db.from('vx2_match_rounds').delete().eq('id',b.dataset.id);
    if(error)return toast(error.message);
    manageRounds(matchId,mapId);
  });
}

function editLineup(matchId){
  openModal(`
    <div class="modal-kicker">MATCH BUILDER · LINEUP</div>
    <h2>ADD PLAYER</h2>
    <form id="lineupForm">
      <div class="form-grid">
        <div class="field full"><label>PLAYER</label><select name="member_id" required>${memberOptions()}</select></div>
        <div class="field full"><label>ROLE</label><select name="lineup_role"><option value="starter">Starter</option><option value="sub">Sub</option></select></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">ADD TO LINEUP ↗</button><button class="mini-btn" type="button" id="cancelLineup">CANCEL</button></div>
    </form>
  `);
  $('#cancelLineup').onclick=()=>manageMatch(matchId);
  $('#lineupForm').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.currentTarget));
    const {error}=await db.from('vx2_match_lineup').upsert({match_id:Number(matchId),member_id:f.member_id,lineup_role:f.lineup_role},{onConflict:'match_id,member_id'});
    if(error)return toast(error.message);
    await loadPublic();manageMatch(matchId);toast('Lineup aggiornata');
  };
}

function editApplication(x){
  openModal(`
    <div class="modal-kicker">ADMIN · TRIAL</div>
    <h2>${esc(x.nickname)}</h2>
    <p class="modal-sub">${esc(x.application_type)} · ${esc(x.real_name||'')} · ${esc(x.contact||'')}</p>
    <div class="modal-section"><h3>EXPERIENCE</h3><p class="modal-sub">${esc(x.experience||'')}</p></div>
    <div class="modal-section"><h3>NOTES</h3><p class="modal-sub">${esc(x.notes||'')}</p></div>
    <form id="editAppForm">
      <div class="form-grid">
        <div class="field full"><label>STATUS</label><select name="status">${['received','in_review','accepted','rejected'].map(v=>`<option value="${v}" ${x.status===v?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="field full"><label>INTERNAL NOTES</label><textarea name="internal_notes">${esc(x.internal_notes||'')}</textarea></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">SAVE STATUS ↗</button></div>
    </form>
  `);
  $('#editAppForm').onsubmit=async e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.currentTarget));
    const assigned=state.member?.id || null;
    const {error}=await db.from('vx2_applications').update({...f,assigned_to:assigned,updated_at:new Date().toISOString()}).eq('id',x.id);
    if(error)return toast(error.message);
    closeModal();showAdmin();toast('Candidatura aggiornata');
  };
}

function editLive(x={}){
  openModal(`
    <div class="modal-kicker">ADMIN · LIVE</div><h2>${x.id?'EDIT':'ADD'} STREAM</h2>
    <form id="editLiveForm"><div class="form-grid">
      <div class="field full"><label>PLAYER</label><select name="member_id" required>${memberOptions(x.member_id)}</select></div>
      <div class="field"><label>PLATFORM</label><select name="platform">${['twitch','youtube','tiktok','other'].map(v=>`<option value="${v}" ${x.platform===v?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>STATUS</label><select name="is_live"><option value="false">Offline</option><option value="true" ${x.is_live?'selected':''}>Live</option></select></div>
      <div class="field full"><label>STREAM URL</label><input name="stream_url" type="url" value="${esc(x.stream_url||'')}" required></div>
      <div class="field full"><label>TITLE</label><input name="title" value="${esc(x.title||'')}"></div>
      <div class="field full"><label>PREVIEW URL</label><input name="preview_url" type="url" value="${esc(x.preview_url||'')}"></div>
    </div><div class="form-actions"><button class="btn primary" type="submit">SAVE STREAM ↗</button></div></form>
  `);
  $('#editLiveForm').onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));
    f.is_live=f.is_live==='true';
    f.started_at=f.is_live?(x.started_at||new Date().toISOString()):(x.started_at||null);
    f.ended_at=!f.is_live?new Date().toISOString():null;
    f.updated_at=new Date().toISOString();
    const q=x.id?db.from('vx2_live_streams').update(f).eq('id',x.id):db.from('vx2_live_streams').insert(f);
    const {error}=await q;if(error)return toast(error.message);
    closeModal();await loadPublic();showAdmin();toast('Live salvata');
  };
}

function editHighlight(x={}){
  openModal(`
    <div class="modal-kicker">ADMIN · CLIP</div><h2>${x.id?'EDIT':'ADD'} HIGHLIGHT</h2>
    <form id="editClipForm"><div class="form-grid">
      <div class="field full"><label>TITLE</label><input name="title" value="${esc(x.title||'')}" required></div>
      <div class="field full"><label>PLAYER</label><select name="member_id"><option value="">None</option>${memberOptions(x.member_id)}</select></div>
      <div class="field"><label>FEATURED</label><select name="featured"><option value="false">No</option><option value="true" ${x.featured?'selected':''}>Yes</option></select></div>
      <div class="field"><label>PUBLISHED</label><select name="published"><option value="true" ${x.published!==false?'selected':''}>Yes</option><option value="false" ${x.published===false?'selected':''}>No</option></select></div>
      <div class="field full"><label>VIDEO URL</label><input name="video_url" type="url" value="${esc(x.video_url||'')}" required></div>
      <div class="field full"><label>THUMBNAIL URL</label><input name="thumbnail_url" type="url" value="${esc(x.thumbnail_url||'')}"></div>
    </div><div class="form-actions"><button class="btn primary" type="submit">SAVE CLIP ↗</button></div></form>
  `);
  $('#editClipForm').onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));
    f.member_id=f.member_id||null;f.featured=f.featured==='true';f.published=f.published==='true';f.game='Call of Duty Mobile';
    const q=x.id?db.from('vx2_highlights').update(f).eq('id',x.id):db.from('vx2_highlights').insert(f);
    const {error}=await q;if(error)return toast(error.message);
    closeModal();await loadPublic();showAdmin();toast('Highlight salvato');
  };
}

function editNews(x={}){
  openModal(`
    <div class="modal-kicker">ADMIN · NEWS</div><h2>${x.id?'EDIT':'ADD'} NEWS</h2>
    <form id="editNewsForm"><div class="form-grid">
      <div class="field full"><label>TITLE</label><input name="title" value="${esc(x.title||'')}" required></div>
      <div class="field"><label>SLUG</label><input name="slug" value="${esc(x.slug||'')}" required></div>
      <div class="field"><label>CATEGORY</label><input name="category" value="${esc(x.category||'team')}"></div>
      <div class="field full"><label>EXCERPT</label><textarea name="excerpt">${esc(x.excerpt||'')}</textarea></div>
      <div class="field full"><label>BODY</label><textarea name="body">${esc(x.body||'')}</textarea></div>
      <div class="field"><label>PUBLISHED</label><select name="published"><option value="true" ${x.published?'selected':''}>Yes</option><option value="false" ${!x.published?'selected':''}>No</option></select></div>
      <div class="field"><label>FEATURED</label><select name="featured"><option value="false">No</option><option value="true" ${x.featured?'selected':''}>Yes</option></select></div>
    </div><div class="form-actions"><button class="btn primary" type="submit">SAVE NEWS ↗</button></div></form>
  `);
  $('#editNewsForm').onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));
    f.published=f.published==='true';f.featured=f.featured==='true';f.published_at=f.published?(x.published_at||new Date().toISOString()):null;
    const q=x.id?db.from('vx2_news').update(f).eq('id',x.id):db.from('vx2_news').insert(f);
    const {error}=await q;if(error)return toast(error.message);
    closeModal();await loadPublic();showAdmin();toast('News salvata');
  };
}

function editSettings(x){
  openModal(`
    <div class="modal-kicker">ADMIN · SETTINGS</div><h2>${esc(x.key)}</h2>
    <form id="settingsForm"><div class="field full"><label>JSON VALUE</label><textarea name="value" style="min-height:320px">${esc(JSON.stringify(x.value,null,2))}</textarea></div>
    <div class="form-actions"><button class="btn primary" type="submit">SAVE SETTINGS ↗</button></div></form>
  `);
  $('#settingsForm').onsubmit=async e=>{
    e.preventDefault();let value;
    try{value=JSON.parse(new FormData(e.currentTarget).get('value'));}catch{return toast('JSON non valido');}
    const {error}=await db.from('vx2_site_settings').update({value,updated_at:new Date().toISOString()}).eq('key',x.key);
    if(error)return toast(error.message);
    closeModal();await loadPublic();showAdmin();toast('Settings salvati');
  };
}

function bindUI(){
  $('#year').textContent=new Date().getFullYear();
  const clock=()=>$('#heroClock').textContent=new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  clock();setInterval(clock,30000);

  window.addEventListener('scroll',()=>$('#topbar').classList.toggle('scrolled',scrollY>20),{passive:true});
  $('#menuBtn').onclick=()=>{$('#mobileMenu').classList.toggle('open');$('#mobileMenu').setAttribute('aria-hidden',!$('#mobileMenu').classList.contains('open'));};
  $$('#mobileMenu a').forEach(a=>a.onclick=()=>$('#mobileMenu').classList.remove('open'));
  $$('[data-close-modal]').forEach(x=>x.onclick=closeModal);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  $('#accountBtn').onclick=showAccount;
  $('#applyBtn').onclick=showApplication;
  $$('#teamTabs button').forEach(b=>b.onclick=()=>{
    state.team=b.dataset.team;
    $$('#teamTabs button').forEach(x=>x.classList.toggle('active',x===b));
    renderTeam();
  });
  $$('[data-open="team"]').forEach(x=>x.onclick=showFullRoster);
  $$('[data-open="matches"]').forEach(x=>x.onclick=showMatches);
  window.addEventListener('hashchange',()=>{
    if(location.hash==='#admin')showAdmin();
    if(location.hash==='#account')showAccount();
  });
}

async function init(){
  bindUI();
  await refreshAuth();
  await loadPublic();
  if(location.hash==='#admin')showAdmin();
}

db.auth.onAuthStateChange(async(event,session)=>{
  state.session=session;
  if(event==='SIGNED_IN'&&!localStorage.getItem('vx2_login_at'))localStorage.setItem('vx2_login_at',Date.now());
  if(event==='SIGNED_OUT')localStorage.removeItem('vx2_login_at');
  setTimeout(refreshAuth,0);
});

init();
