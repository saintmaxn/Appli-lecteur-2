(() => {
  'use strict';
  const STORAGE_KEY = 'lumiere-iptv-v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const video = $('#video');
  const playerWrap = $('#player-wrap');
  const dialog = $('#playlist-dialog');
  let state = loadState();
  let currentId = null;
  let hls = null;
  let activeView = 'home';
  let activeCategory = 'Tout';
  let searchTerm = '';
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { channels: Array.isArray(saved.channels) ? saved.channels : [], favorites: Array.isArray(saved.favorites) ? saved.favorites : [], history: Array.isArray(saved.history) ? saved.history : [], playlistUrl: saved.playlistUrl || '' };
    } catch { return { channels: [], favorites: [], history: [], playlistUrl: '' }; }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function cleanName(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); }
  function parseM3U(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const channels = [];
    let pending = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF')) {
        const attrs = {};
        const attrRegex = /([\w-]+)="([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(line)) !== null) attrs[match[1].toLowerCase()] = match[2];
        const comma = line.indexOf(',');
        const name = cleanName(comma >= 0 ? line.slice(comma + 1) : attrs['tvg-name'] || 'Chaîne sans nom');
        pending = { name: name || attrs['tvg-name'] || 'Chaîne sans nom', group: cleanName(attrs['group-title'] || 'Autres'), logo: attrs['tvg-logo'] || '', id: '' };
      } else if (line[0] !== '#') {
        if (/^(https?:\/\/|rtmp:\/\/|rtsp:\/\/)/i.test(line) && pending) {
          pending.url = line;
          pending.id = hash(`${pending.name}|${pending.group}|${line}`);
          channels.push(pending);
        }
        pending = null;
      }
    }
    return channels;
  }
  function getChannel(id) { return state.channels.find(c => c.id === id); }
  function showToast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
  function initials(name) { return cleanName(name).split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase() || 'TV'; }
  function channelLogo(channel, extra = '') { return `<div class="channel-logo ${extra}">${channel.logo ? `<img src="${escapeHtml(channel.logo)}" alt="" loading="lazy" onerror="this.remove()">` : escapeHtml(initials(channel.name))}</div>`; }
  function cardMarkup(channel, badge = '') {
    const isFav = state.favorites.includes(channel.id);
    const tint = ['#8372d5','#4a9d91','#c07858','#6485c6','#a26a97','#9c9b57'][parseInt(hash(channel.group || channel.name), 36) % 6];
    return `<article class="channel-card" data-channel="${escapeHtml(channel.id)}" tabindex="0" role="button" aria-label="Regarder ${escapeHtml(channel.name)}"><div class="card-art" style="--art:${tint}">${badge ? `<span class="card-tag">${escapeHtml(badge)}</span>` : ''}<button class="card-fav ${isFav ? 'on' : ''}" data-favorite="${escapeHtml(channel.id)}" aria-label="${isFav ? 'Retirer des' : 'Ajouter aux'} favoris">${isFav ? '♥' : '♡'}</button><div class="card-logo">${channel.logo ? `<img src="${escapeHtml(channel.logo)}" alt="" loading="lazy" onerror="this.remove()">` : escapeHtml(initials(channel.name))}</div></div><div class="card-meta"><h3>${escapeHtml(channel.name)}</h3><p>${escapeHtml(channel.group || 'Autres')}</p></div></article>`;
  }
  function emptyMarkup(title, detail, action = '') { return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(detail)}${action}</div>`; }
  function renderCards(container, channels, options = {}) {
    if (!channels.length) { container.innerHTML = emptyMarkup(options.emptyTitle || 'Rien à afficher pour le moment', options.emptyDetail || 'Importez une playlist pour commencer.', options.action || ''); return; }
    container.innerHTML = channels.map(c => cardMarkup(c, options.badges?.[c.id] || '')).join('');
  }
  function recommendedChannels() {
    const watched = state.history.filter(h => h.count > 0);
    const affinity = {};
    for (const item of watched) {
      const channel = getChannel(item.id);
      if (!channel) continue;
      const group = channel.group || 'Autres';
      affinity[group] = (affinity[group] || 0) + Math.min(item.count, 5) * 2 + 1;
    }
    const watchedIds = new Set(watched.map(item => item.id));
    return state.channels.filter(c => !watchedIds.has(c.id)).map(c => {
      let score = affinity[c.group || 'Autres'] || 0;
      if (state.favorites.includes(c.id)) score += 1.5;
      const n = parseInt(hash(c.id), 36) || 1;
      score += (n % 100) / 1000;
      return { channel: c, score };
    }).sort((a, b) => b.score - a.score).slice(0, 4).map(({channel}) => channel);
  }
  function renderHome() {
    const recs = recommendedChannels();
    const badges = {};
    const hasHistory = state.history.some(h => h.count);
    recs.forEach(c => { badges[c.id] = hasHistory && state.history.some(h => getChannel(h.id)?.group === c.group) ? 'POUR VOUS' : c.group; });
    renderCards($('#recommendations'), recs, { badges, emptyTitle: state.channels.length ? 'Vous avez tout vu !' : 'Votre prochaine découverte vous attend', emptyDetail: state.channels.length ? 'Vous avez regardé toutes les chaînes de votre playlist.' : 'Importez une playlist M3U pour voir vos chaînes recommandées.' });
    const recent = state.history.slice().sort((a,b) => b.lastPlayed - a.lastPlayed).map(h => getChannel(h.id)).filter(Boolean).slice(0,4);
    renderCards($('#recent-channels'), recent, { badges: Object.fromEntries(recent.map(c => [c.id, 'RÉCEMMENT REGARDÉ'])), emptyTitle: 'Votre historique est encore vide', emptyDetail: 'Les chaînes que vous regardez apparaîtront ici.' });
    $('#channel-count').textContent = state.channels.length;
  }
  function renderLibrary() {
    const isFiltered = activeView !== 'channels';
    const titles = { channels: ['VOTRE BIBLIOTHÈQUE','Toutes les chaînes'], favorites: ['VOTRE SÉLECTION','Mes favoris'], history: ['À REPRENDRE','Récemment regardé'] };
    const [eyebrow, title] = titles[activeView] || titles.channels;
    $('#library-eyebrow').textContent = eyebrow; $('#library-title').textContent = title;
    let list = state.channels;
    if (activeView === 'favorites') list = list.filter(c => state.favorites.includes(c.id));
    if (activeView === 'history') list = state.history.slice().sort((a,b) => b.lastPlayed-a.lastPlayed).map(h => getChannel(h.id)).filter(Boolean);
    if (activeCategory !== 'Tout') list = list.filter(c => c.group === activeCategory);
    if (searchTerm) list = list.filter(c => `${c.name} ${c.group}`.toLowerCase().includes(searchTerm.toLowerCase()));
    $('#library-total').textContent = `${list.length} chaîne${list.length === 1 ? '' : 's'}`;
    const groups = [...new Set(state.channels.map(c => c.group || 'Autres'))].sort((a,b) => a.localeCompare(b, 'fr'));
    $('#filter-row').innerHTML = ['Tout', ...groups].map(g => `<button class="filter-chip ${activeCategory === g ? 'active' : ''}" data-category="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('');
    const empty = activeView === 'favorites' ? ['Pas encore de favoris', 'Touchez le cœur d’une chaîne pour la retrouver ici.'] : activeView === 'history' ? ['Aucun historique pour le moment', 'Lancez une chaîne et elle apparaîtra ici.'] : ['Votre bibliothèque est vide', 'Importez un fichier M3U ou ajoutez le lien de votre playlist.'];
    renderCards($('#library-channels'), list, { emptyTitle: empty[0], emptyDetail: searchTerm ? `Aucun résultat pour « ${searchTerm} ». Modifiez votre recherche.` : empty[1] });
  }
  function render() {
    const home = activeView === 'home';
    $('#recommendations-section').hidden = !home; $('#recent-section').hidden = !home; $('#library-view').hidden = home;
    $('#page-title').textContent = ({home:'Accueil',channels:'Chaînes',favorites:'Mes favoris',history:'Récemment regardé'})[activeView] || 'Accueil';
    $$('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === activeView));
    if (home) renderHome(); else renderLibrary();
  }
  function play(channel) {
    if (!channel) return;
    currentId = channel.id;
    $('#current-title').textContent = channel.name;
    $('#current-group').textContent = channel.group || 'Autres';
    $('#current-logo').innerHTML = channel.logo ? `<img src="${escapeHtml(channel.logo)}" alt="">` : escapeHtml(initials(channel.name));
    $('#favorite-current').hidden = false;
    updateFavoriteButton();
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.load();
    const url = channel.url;
    const isHls = /\.m3u8($|\?)/i.test(url) || /m3u8/i.test(channel.mime || '');
    if (isHls && window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true }); hls.loadSource(url); hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) showToast('Lecture impossible. Vérifiez le flux ou sa disponibilité.'); });
    } else { video.src = url; }
    playerWrap.classList.add('playing');
    video.play().catch(() => showToast('Appuyez sur lecture pour démarrer la chaîne.'));
    const existing = state.history.find(h => h.id === channel.id);
    if (existing) { existing.count = (existing.count || 0) + 1; existing.lastPlayed = Date.now(); }
    else state.history.push({ id: channel.id, count: 1, lastPlayed: Date.now() });
    state.history = state.history.slice(-100);
    saveState(); render();
    if (window.innerWidth < 720) playerWrap.scrollIntoView({behavior:'smooth', block:'center'});
  }
  function toggleFavorite(id) {
    if (state.favorites.includes(id)) state.favorites = state.favorites.filter(item => item !== id);
    else state.favorites.push(id);
    saveState(); render(); updateFavoriteButton();
  }
  function updateFavoriteButton() {
    const button = $('#favorite-current');
    const active = state.favorites.includes(currentId);
    button.classList.toggle('on', active); button.textContent = active ? '♥' : '♡'; button.setAttribute('aria-label', active ? 'Retirer des favoris' : 'Ajouter aux favoris');
  }
  function importText(text, label, url = '') {
    const channels = parseM3U(text);
    if (!channels.length) throw new Error('Aucune chaîne valide trouvée. Vérifiez que la playlist est au format M3U.');
    const previous = new Map(state.channels.map(c => [c.url, c]));
    state.channels = channels.map(c => ({...c, ...(previous.get(c.url) ? {id: previous.get(c.url).id} : {})}));
    state.favorites = state.favorites.filter(id => state.channels.some(c => c.id === id));
    state.history = state.history.filter(h => state.channels.some(c => c.id === h.id));
    if (url) state.playlistUrl = url;
    saveState(); render(); dialog.close(); $('#playlist-url').value = ''; $('#form-error').textContent = '';
    showToast(`${channels.length} chaîne${channels.length === 1 ? '' : 's'} chargée${channels.length === 1 ? '' : 's'}${label ? ` · ${label}` : ''}`);
  }
  async function loadUrl(url) {
    const button = $('#playlist-submit'); button.disabled = true; button.innerHTML = 'Chargement…'; $('#form-error').textContent = '';
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Le serveur répond avec l’erreur ${response.status}.`);
      importText(await response.text(), '', url);
    } catch (error) {
      $('#form-error').textContent = error instanceof TypeError ? 'Impossible de charger ce lien depuis le navigateur (CORS ou réseau). Essayez de télécharger le fichier puis de l’importer.' : error.message;
    } finally { button.disabled = false; button.innerHTML = 'Charger la playlist <span>→</span>'; }
  }
  async function readFile(file) {
    if (!file) return;
    try { importText(await file.text(), file.name); }
    catch (error) { showToast(error.message); }
  }

  $$('.nav-link, .see-all').forEach(button => button.addEventListener('click', () => { activeView = button.dataset.view; activeCategory = 'Tout'; render(); window.scrollTo({top:0, behavior:'smooth'}); }));
  document.addEventListener('click', event => {
    const fav = event.target.closest('[data-favorite]');
    if (fav) { event.stopPropagation(); toggleFavorite(fav.dataset.favorite); return; }
    const card = event.target.closest('[data-channel]');
    if (card) play(getChannel(card.dataset.channel));
    const category = event.target.closest('[data-category]');
    if (category) { activeCategory = category.dataset.category; renderLibrary(); }
  });
  document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-channel]')) { event.preventDefault(); play(getChannel(event.target.dataset.channel)); } });
  $('#favorite-current').addEventListener('click', () => currentId && toggleFavorite(currentId));
  $('#add-playlist-open').addEventListener('click', () => dialog.showModal());
  $('#search-toggle').addEventListener('click', () => { $('#search-row').hidden = !$('#search-row').hidden; if (!$('#search-row').hidden) $('#search-input').focus(); });
  $('#search-close').addEventListener('click', () => { $('#search-row').hidden = true; $('#search-input').value = ''; searchTerm = ''; render(); });
  $('#search-input').addEventListener('input', event => { searchTerm = event.target.value.trim(); if (activeView === 'home') activeView = 'channels'; render(); });
  $('#playlist-file').addEventListener('change', event => { readFile(event.target.files[0]); event.target.value = ''; });
  $('#playlist-file-dialog').addEventListener('change', event => { readFile(event.target.files[0]); event.target.value = ''; });
  $('#playlist-url-form').addEventListener('submit', event => { event.preventDefault(); loadUrl($('#playlist-url').value.trim()); });
  $('#player-expand').addEventListener('click', () => { if (playerWrap.requestFullscreen) playerWrap.requestFullscreen(); });
  $('#reset-data').addEventListener('click', () => { if (!confirm('Effacer la playlist, les favoris et l’historique enregistrés sur cet appareil ?')) return; localStorage.removeItem(STORAGE_KEY); state = loadState(); currentId = null; video.pause(); video.removeAttribute('src'); playerWrap.classList.remove('playing'); $('#current-title').textContent = 'Aucune chaîne sélectionnée'; $('#current-group').textContent = 'Importez votre playlist pour commencer'; $('#favorite-current').hidden = true; render(); showToast('Données effacées.'); });
  $('#today-label').textContent = new Intl.DateTimeFormat('fr-FR', {weekday:'long', day:'numeric', month:'long'}).format(new Date()).toUpperCase();
  const hour = new Date().getHours(); $('#welcome-title').innerHTML = `${hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'}<span class="sun"> ✳</span>`;
  render();
})();
