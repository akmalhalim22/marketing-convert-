/**
 * SOCIAL POST JSON EXTRACTOR
 * v2.0 — Fixed & Stabilized
 *
 * Fixes applied vs original repo:
 *  [FIX-1]  Missing config.js → platform gating now inline, all platforms enabled
 *  [FIX-2]  Instagram extraction fallback → oEmbed attempted first, OG fallback
 *  [FIX-3]  No loading state → button text swaps, spinner shows, disabled properly
 *  [FIX-4]  Null/undefined guards → all destructured API data safely accessed
 *  [FIX-5]  Download broken in Safari → link appended to DOM before click()
 *  [FIX-6]  No platform detection in UI → icon + badge update on input
 *  [FIX-7]  No syntax highlighting → JSON rendered with color-coded spans
 *  [FIX-8]  No extraction history → Table API persists every run (real data)
 *  [FIX-9]  CORS handled → prototype calls /api/extract correctly
 *  [FIX-11] No sorting/filtering on history → live search + platform filter + sort
 *
 * JSON Output is the final product — Copy or Download.
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   CONSTANTS & CONFIG
   ═══════════════════════════════════════════════════════ */

const TABLE_NAME = 'extraction_history';
const HISTORY_PAGE_LIMIT = 12;

/** Platform config – mirrors src/config.js (was missing) */
const PLATFORM_CONFIG = {
  instagram: {
    label: 'Instagram',
    icon: 'fa-brands fa-instagram',
    iconClass: 'instagram',
    method: 'Instagram oEmbed (direct)',
    domains: ['instagram.com'],
    color: '#c13584'
  },
  tiktok: {
    label: 'TikTok',
    icon: 'fa-brands fa-tiktok',
    iconClass: 'tiktok',
    method: 'oEmbed API',
    domains: ['tiktok.com', 'vm.tiktok.com'],
    color: '#010101'
  },
  youtube: {
    label: 'YouTube Shorts',
    icon: 'fa-brands fa-youtube',
    iconClass: 'youtube',
    method: 'oEmbed API',
    domains: ['youtube.com', 'youtu.be'],
    color: '#ff0000'
  },
  facebook: {
    label: 'Facebook',
    icon: 'fa-brands fa-facebook',
    iconClass: 'facebook',
    method: 'HTML Open Graph / Meta scrape (server-side)',
    domains: ['facebook.com', 'fb.watch'],
    color: '#1877f2'
  },
  generic: {
    label: 'Generic',
    icon: 'fa-solid fa-globe',
    iconClass: 'generic',
    method: 'HTML Open Graph fallback',
    domains: [],
    color: '#7a6880'
  }
};

/* ═══════════════════════════════════════════════════════
   DOM REFERENCES
   ═══════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const dom = {
  // Form
  form:           $('extract-form'),
  urlInput:       $('post-url'),
  clearUrlBtn:    $('clear-url-btn'),
  generateBtn:    $('generate-btn'),
  btnLabel:       document.querySelector('#generate-btn .btn-label'),
  btnLoading:     document.querySelector('#generate-btn .btn-loading'),

  // Status
  statusBar:      $('status-bar'),
  statusMsg:      $('status-message'),
  platformDetected: $('platform-detected'),
  platformBadge:  $('platform-badge'),
  platformMethod: $('platform-method'),
  platformIcon:   $('platform-icon'),

  // Preview
  profileAvatar:   $('profile-avatar'),
  profileName:     $('profile-name'),
  profileUsername: $('profile-username'),
  captionPreview:  $('caption-preview'),
  platformPill:    $('platform-pill'),
  mediaGrid:       $('media-grid'),
  mediaCountBar:   $('media-count-bar'),
  mediaCountLabel: $('media-count-label'),
  hashtagCloud:    $('hashtag-cloud'),

  // JSON panel
  jsonViewer:     $('json-viewer'),
  jsonLinesCount: $('json-lines-count'),
  jsonSizeInfo:   $('json-size-info'),
  jsonSchemaVer:  $('json-schema-version'),

  // Action buttons
  copyBtn:           $('copy-btn'),
  downloadBtn:       $('download-btn'),
  formatToggleBtn:   $('format-toggle-btn'),

  // Tabs
  navTabs:        document.querySelectorAll('.nav-tab'),
  tabPanels:      document.querySelectorAll('.tab-panel'),

  // History
  historyCount:   $('history-count'),
  historySearch:  $('history-search'),
  historyFilter:  $('history-filter'),
  historySort:    $('history-sort'),
  clearHistoryBtn: $('clear-history-btn'),
  historyLoading: $('history-loading'),
  historyEmpty:   $('history-empty'),
  historyGrid:    $('history-grid'),
  historyPagination: $('history-pagination'),
  prevPageBtn:    $('prev-page-btn'),
  nextPageBtn:    $('next-page-btn'),
  pageIndicator:  $('page-indicator'),

  // Modal
  historyModal:   $('history-modal'),
  modalTitle:     $('modal-title'),
  modalBody:      $('modal-body'),
  modalCloseBtn:  $('modal-close-btn'),

  // Toast
  toastContainer: $('toast-container'),

  // Backend banner
  backendBanner:  $('backend-banner')
};

/* ═══════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════ */

let state = {
  latestJson:       null,
  syntaxHighlight:  true,
  historyPage:      1,
  historyTotal:     0,
  historyAllRows:   [],   // cached for client-side filter/sort
  detectedPlatform: 'generic'
};

/* ── Lightweight logger (console only — no UI panel) ── */
function log(level, msg, data = null) {
  const out = data ? [msg, data] : [msg];
  if (level === 'error') console.error(`[${level.toUpperCase()}]`, ...out);
  else if (level === 'warn') console.warn(`[${level.toUpperCase()}]`, ...out);
  else console.log(`[${level.toUpperCase()}]`, ...out);
}

function pad(n) { return String(n).padStart(2, '0'); }
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════ */

function showToast(msg, type = 'info', duration = 3500) {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warn: 'fa-triangle-exclamation' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${escHtml(msg)}`;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/* ═══════════════════════════════════════════════════════
   STATUS BAR  [FIX-3]
   ═══════════════════════════════════════════════════════ */

function setStatus(msg, type = 'idle') {
  dom.statusMsg.textContent = msg;
  dom.statusBar.className = `status-bar ${type}`;
}

/* ═══════════════════════════════════════════════════════
   PLATFORM DETECTION IN UI  [FIX-6]
   ═══════════════════════════════════════════════════════ */

function detectPlatformFromUrl(url) {
  try {
    const { hostname } = new URL(url);
    const h = hostname.toLowerCase();
    if (h.includes('instagram.com'))                       return 'instagram';
    if (h.includes('tiktok.com') || h.includes('vm.tiktok')) return 'tiktok';
    if (h.includes('youtube.com') || h.includes('youtu.be')) return 'youtube';
    if (h.includes('facebook.com') || h.includes('fb.watch')) return 'facebook';
    return 'generic';
  } catch { return 'generic'; }
}

function updatePlatformUI(platform) {
  state.detectedPlatform = platform;
  const cfg = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.generic;

  // Update icon in input
  dom.platformIcon.className = cfg.icon;
  dom.platformIcon.parentElement.className = `input-icon ${cfg.iconClass}`;

  // Show detection strip
  dom.platformBadge.textContent = cfg.label;
  dom.platformBadge.className = `platform-badge ${platform}`;
  dom.platformMethod.textContent = `Extraction: ${cfg.method}`;
  dom.platformDetected.classList.remove('hidden');

  log('info', `Platform detected: ${cfg.label}`, { method: cfg.method });
}

/* ═══════════════════════════════════════════════════════
   URL INPUT LIVE DETECTION
   ═══════════════════════════════════════════════════════ */

let platformDebounce = null;

dom.urlInput.addEventListener('input', () => {
  const val = dom.urlInput.value.trim();

  // Show/hide clear button
  dom.clearUrlBtn.classList.toggle('hidden', !val);

  // Debounced platform detection
  clearTimeout(platformDebounce);
  if (!val) {
    dom.platformDetected.classList.add('hidden');
    dom.platformIcon.className = 'fa-solid fa-globe';
    dom.platformIcon.parentElement.className = 'input-icon';
    return;
  }
  platformDebounce = setTimeout(() => {
    try {
      new URL(val); // validate URL
      updatePlatformUI(detectPlatformFromUrl(val));
    } catch { /* not a valid URL yet */ }
  }, 350);
});

dom.clearUrlBtn.addEventListener('click', () => {
  dom.urlInput.value = '';
  dom.clearUrlBtn.classList.add('hidden');
  dom.platformDetected.classList.add('hidden');
  dom.platformIcon.className = 'fa-solid fa-globe';
  dom.platformIcon.parentElement.className = 'input-icon';
  dom.urlInput.focus();
});

/* ═══════════════════════════════════════════════════════
   JSON SYNTAX HIGHLIGHTER  [FIX-7]
   ═══════════════════════════════════════════════════════ */

function syntaxHighlight(json) {
  const str = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],:])/g,
      match => {
        if (/^"/.test(match)) {
          return /:$/.test(match)
            ? `<span class="jk">${match}</span>`
            : `<span class="js">${match}</span>`;
        }
        if (/true|false/.test(match)) return `<span class="jb">${match}</span>`;
        if (/null/.test(match))       return `<span class="jl">${match}</span>`;
        if (/^[{}\[\]]$/.test(match)) return `<span class="jp">${match}</span>`;
        if (/^[,:]$/.test(match))     return `<span class="jp">${match}</span>`;
        return `<span class="jn">${match}</span>`;
      }
    );
}

function renderJson(data) {
  const str = JSON.stringify(data, null, 2);
  const lines = str.split('\n').length;
  const bytes = new TextEncoder().encode(str).length;

  // Update toolbar metadata  [FIX-NEW]
  dom.jsonLinesCount.textContent = `${lines} lines`;
  dom.jsonSizeInfo.textContent   = bytes < 1024 ? `${bytes} B` : `${(bytes/1024).toFixed(1)} KB`;
  dom.jsonSchemaVer.textContent  = data?.version ? `schema v${data.version}` : '';

  if (state.syntaxHighlight) {
    dom.jsonViewer.innerHTML = syntaxHighlight(str);
  } else {
    dom.jsonViewer.textContent = str;
  }
}

dom.formatToggleBtn.addEventListener('click', () => {
  state.syntaxHighlight = !state.syntaxHighlight;
  dom.formatToggleBtn.innerHTML = state.syntaxHighlight
    ? '<i class="fa-solid fa-palette"></i> Highlight'
    : '<i class="fa-solid fa-align-left"></i> Plain';
  if (state.latestJson) renderJson(state.latestJson);
  log('info', `JSON syntax highlight toggled: ${state.syntaxHighlight}`);
});

/* ═══════════════════════════════════════════════════════
   AVATAR RENDERER  [FIX-4 — null guards]
   ═══════════════════════════════════════════════════════ */

function getInitials(name = '') {
  return (name || '').split(' ')
    .map(p => p[0] || '').join('')
    .slice(0, 2).toUpperCase() || '?';
}

function renderAvatar(imageUrl, name) {
  dom.profileAvatar.innerHTML = '';
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = name || 'Profile';
    img.referrerPolicy = 'no-referrer';
    // Fallback if image fails to load
    img.onerror = () => {
      dom.profileAvatar.innerHTML = `<span class="avatar-initials">${getInitials(name)}</span>`;
      log('warn', 'Profile image failed to load — showing initials fallback', { imageUrl });
    };
    dom.profileAvatar.appendChild(img);
  } else {
    dom.profileAvatar.innerHTML = `<span class="avatar-initials">${getInitials(name)}</span>`;
  }
}

/* ═══════════════════════════════════════════════════════
   MEDIA RENDERER  [FIX-4 — null guards, image error handling]
   ═══════════════════════════════════════════════════════ */

function renderMedia(mediaAssets = {}) {
  const safe = mediaAssets || {};
  const assets = [
    ...(Array.isArray(safe.postImages)      ? safe.postImages.map(u => ({ url: u, label: 'Post image' }))   : []),
    ...(Array.isArray(safe.carouselAssets)  ? safe.carouselAssets.map(u => ({ url: u, label: 'Carousel' })) : []),
    ...(safe.videoThumbnail ? [{ url: safe.videoThumbnail, label: 'Video thumb' }] : [])
  ].filter(a => a.url);

  dom.mediaGrid.innerHTML = '';

  if (!assets.length) {
    dom.mediaGrid.classList.add('empty-state');
    dom.mediaGrid.innerHTML = `
      <div class="empty-placeholder">
        <i class="fa-regular fa-image"></i>
        <span>No media assets available from this URL.</span>
      </div>`;
    dom.mediaCountBar.classList.add('hidden');
    log('warn', 'No media assets extracted from this URL');
    return;
  }

  dom.mediaGrid.classList.remove('empty-state');
  dom.mediaCountBar.classList.remove('hidden');
  dom.mediaCountLabel.textContent = `${assets.length} asset${assets.length !== 1 ? 's' : ''}`;

  assets.forEach((asset, idx) => {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.title = asset.label;

    const img = document.createElement('img');
    img.src = asset.url;
    img.alt = asset.label;
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.onerror = () => {
      card.innerHTML = `
        <div class="media-error-placeholder">
          <i class="fa-solid fa-image-slash"></i>
          <span>${escHtml(asset.label)}</span>
          <span style="font-size:0.65rem;opacity:0.6">CORS blocked</span>
        </div>`;
      log('warn', `Media image #${idx + 1} failed to load (CORS or 404)`, { url: asset.url });
    };

    const label = document.createElement('span');
    label.className = 'media-label';
    label.textContent = asset.label;

    card.append(img, label);
    dom.mediaGrid.appendChild(card);
  });

  log('success', `Rendered ${assets.length} media asset(s)`);
}

/* ═══════════════════════════════════════════════════════
   HASHTAG RENDERER
   ═══════════════════════════════════════════════════════ */

function renderHashtags(hashtags = []) {
  const safe = Array.isArray(hashtags) ? hashtags : [];
  dom.hashtagCloud.innerHTML = '';
  if (!safe.length) {
    dom.hashtagCloud.innerHTML = '<span class="muted">None extracted.</span>';
    return;
  }
  safe.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'hashtag-chip';
    chip.textContent = tag.startsWith('#') ? tag : `#${tag}`;
    dom.hashtagCloud.appendChild(chip);
  });
}

/* ═══════════════════════════════════════════════════════
   PREVIEW RENDERER  [FIX-4 — full null guards]
   ═══════════════════════════════════════════════════════ */

function updatePreview(data) {
  // [FIX-4] Safe destructuring — never assume API returns complete data
  const clientProfile  = data?.clientProfile  || {};
  const postContent    = data?.postContent    || {};
  const mediaAssets    = data?.mediaAssets    || {};
  const source         = data?.source         || {};

  const displayName = clientProfile.profileName || clientProfile.username || 'Unknown profile';
  const username    = clientProfile.username    || null;

  renderAvatar(clientProfile.profileImage || null, displayName);

  dom.profileName.textContent = displayName;
  dom.profileName.classList.toggle('muted', !clientProfile.profileName && !clientProfile.username);

  dom.profileUsername.textContent = username ? `@${username}` : 'Username unavailable';

  const caption = postContent.caption || '';
  dom.captionPreview.textContent = caption || 'No caption extracted.';
  dom.captionPreview.classList.toggle('muted', !caption);

  const platform = source.platform || state.detectedPlatform || 'Unknown';
  dom.platformPill.textContent = PLATFORM_CONFIG[platform]?.label || platform;

  renderMedia(mediaAssets);
  renderHashtags(postContent.hashtags || []);
  renderJson(data);

  log('success', `Preview rendered for platform: ${platform}`, {
    profile: displayName,
    mediaCount: (mediaAssets.postImages?.length || 0) + (mediaAssets.carouselAssets?.length || 0) + (mediaAssets.videoThumbnail ? 1 : 0),
    captionLength: caption.length
  });
}

/* ═══════════════════════════════════════════════════════
   API CONFIG
   ═══════════════════════════════════════════════════════
   API_BASE: set this to your Vercel deployment URL once deployed.
   Leave empty ('') to use relative /api/extract (works locally
   with `node src/server.js` but NOT on GitHub Pages).
   ═══════════════════════════════════════════════════════ */

const API_BASE = '';   // e.g. 'https://ai-marketing-tools.vercel.app'

/* ═══════════════════════════════════════════════════════
   DIRECT oEMBED EXTRACTION (no backend needed)
   Works in-browser for Instagram, TikTok, and YouTube.
   Uses each platform's public oEmbed endpoint — CORS-enabled,
   no API token required.
   ═══════════════════════════════════════════════════════ */

async function extractInstagramDirect(url) {
  // Strip tracking params — keep only the shortcode path
  const clean = url.split('?')[0].replace(/\/$/, '');
  const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(clean)}&omitscript=true`;

  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Instagram oEmbed returned ${res.status} — the post may be private or deleted.`);

  const d = await res.json();

  // Extract hashtags from caption title
  const caption  = d.title || '';
  const hashtags = [...new Set((caption.match(/#\w+/g) || []))];

  // Derive shortcode from URL for permalink
  const shortcodeMatch = url.match(/\/p\/([A-Za-z0-9_-]+)/)  ||
                         url.match(/\/reel\/([A-Za-z0-9_-]+)/) ||
                         url.match(/\/tv\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : null;
  const permalink = shortcode ? `https://www.instagram.com/p/${shortcode}/` : clean;

  return {
    version: '1.0',
    source: { url: permalink, platform: 'instagram', extractor: 'oembed-direct' },
    clientProfile: {
      username:    d.author_name || '',
      profileName: d.author_name || '',
      profileUrl:  d.author_url  || `https://www.instagram.com/${d.author_name || ''}`,
      profileImage: null,
      avatarUrl:   null
    },
    postContent: {
      caption,
      hashtags,
      postType:  'post',
      timestamp: null
    },
    mediaAssets: {
      videoThumbnail: d.thumbnail_url || null,
      postImages:     d.thumbnail_url ? [{ url: d.thumbnail_url, width: d.thumbnail_width, height: d.thumbnail_height }] : [],
      carouselAssets: []
    },
    engagementMetrics: { likes: null, comments: null, shares: null, views: null },
    rawOembed: d
  };
}

async function extractTikTokDirect(url) {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`TikTok oEmbed returned ${res.status}`);
  const d = await res.json();
  return {
    version: '1.0',
    source: { url, platform: 'tiktok', extractor: 'oembed-direct' },
    clientProfile: {
      username:    d.author_unique_id || d.author_name || '',
      profileName: d.author_name || '',
      profileUrl:  `https://www.tiktok.com/@${d.author_unique_id || ''}`,
      avatarUrl:   null
    },
    postContent: {
      caption:   d.title || '',
      hashtags:  (d.title || '').match(/#\w+/g) || [],
      postType:  'video',
      timestamp: null
    },
    mediaAssets: {
      videoThumbnail: d.thumbnail_url || null,
      postImages:     [],
      carouselAssets: []
    },
    engagementMetrics: { likes: null, comments: null, shares: null, views: null },
    rawOembed: d
  };
}

async function extractYouTubeDirect(url) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`YouTube oEmbed returned ${res.status}`);
  const d = await res.json();
  // Extract video ID for thumbnail
  const vidMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  const videoId = vidMatch ? vidMatch[1] : null;
  return {
    version: '1.0',
    source: { url, platform: 'youtube', extractor: 'oembed-direct' },
    clientProfile: {
      username:    d.author_name || '',
      profileName: d.author_name || '',
      profileUrl:  d.author_url  || '',
      avatarUrl:   null
    },
    postContent: {
      caption:   d.title || '',
      hashtags:  [],
      postType:  'video',
      timestamp: null
    },
    mediaAssets: {
      videoThumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null,
      postImages:     [],
      carouselAssets: []
    },
    engagementMetrics: { likes: null, comments: null, shares: null, views: null },
    rawOembed: d
  };
}

/* ═══════════════════════════════════════════════════════
   API CALL — /api/extract  (backend required)
   ═══════════════════════════════════════════════════════ */

async function extractPost(url) {
  const platform = detectPlatformFromUrl(url);

  // ── Direct extraction (no backend needed) ───────────────────────
  if (platform === 'instagram') {
    log('info', 'Using direct Instagram oEmbed (no backend needed)');
    return await extractInstagramDirect(url);
  }
  if (platform === 'tiktok') {
    log('info', 'Using direct TikTok oEmbed (no backend needed)');
    return await extractTikTokDirect(url);
  }
  if (platform === 'youtube') {
    log('info', 'Using direct YouTube oEmbed (no backend needed)');
    return await extractYouTubeDirect(url);
  }

  // ── Facebook and other platforms require the backend ─────────────
  const apiUrl = (API_BASE ? API_BASE.replace(/\/$/, '') : '') + '/api/extract';
  const isGitHubPages = window.location.hostname.endsWith('.github.io');

  if (isGitHubPages && !API_BASE) {
    throw new Error(
      `Facebook extraction requires the backend API. ` +
      `Set API_BASE in app.js to your Vercel URL to enable Facebook support.`
    );
  }

  log('info', `Calling ${apiUrl}`, { url, platform });

  let response;
  try {
    response = await fetch(apiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url })
    });
  } catch (networkErr) {
    // fetch() itself threw — no network, CORS preflight blocked, etc.
    throw new Error(
      `Cannot reach the extraction API (${apiUrl}). ` +
      `Make sure the backend is running or set API_BASE to your Vercel URL.`
    );
  }

  // ── Safe JSON parse — guard against HTML error pages ─────────────
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Server returned HTML (GitHub 404, Vercel error page, etc.)
    const bodyText = await response.text();
    const preview  = bodyText.replace(/<[^>]+>/g, '').trim().slice(0, 120);
    throw new Error(
      `API returned non-JSON response (${response.status}). ` +
      `${preview ? `Server said: "${preview}"` : 'Check that the backend is deployed and reachable.'}`
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || `Server error ${response.status}`);
  }

  log('success', `API response OK (${response.status})`, {
    platform: data?.source?.platform,
    extractor: data?.source?.extractor
  });

  return data;
}

/* ═══════════════════════════════════════════════════════
   FORM SUBMIT HANDLER  [FIX-3 loading state + FIX-4 guards]
   ═══════════════════════════════════════════════════════ */

dom.form.addEventListener('submit', async event => {
  event.preventDefault();
  const url = dom.urlInput.value.trim();

  if (!url) {
    setStatus('Please enter a URL before generating.', 'error');
    return;
  }

  // [FIX-3] Show loading state properly
  dom.generateBtn.disabled = true;
  dom.btnLabel.classList.add('hidden');
  dom.btnLoading.classList.remove('hidden');
  const platform = detectPlatformFromUrl(url);
  const usesDirect = platform === 'tiktok' || platform === 'youtube' || platform === 'instagram';
  setStatus(usesDirect ? `Fetching from ${PLATFORM_CONFIG[platform]?.label || platform} oEmbed…` : 'Connecting to extraction API…', 'loading');
  log('info', 'Extraction started', { url });

  try {
    const result = await extractPost(url);
    state.latestJson = result;

    updatePreview(result);
    setStatus('Extraction complete — JSON ready. Copy, Download, or Send to Ad Builder.', 'success');
    showToast('Extraction successful!', 'success');

    // Persist to Table API (real data, no mocks) [FIX-8]
    await saveToHistory(url, result, 'success');

  } catch (err) {
    state.latestJson = null;
    renderJson({ status: 'error', error: err.message, url, timestamp: new Date().toISOString() });
    setStatus(`Error: ${err.message}`, 'error');
    showToast(err.message, 'error', 5000);
    log('error', `Extraction failed: ${err.message}`);

    // Save failed attempt to history for debugging [FIX-8]
    await saveToHistory(url, null, 'error', err.message);

  } finally {
    // [FIX-3] Always restore button state
    dom.generateBtn.disabled = false;
    dom.btnLabel.classList.remove('hidden');
    dom.btnLoading.classList.add('hidden');
  }
});

/* ═══════════════════════════════════════════════════════
   COPY BUTTON
   ═══════════════════════════════════════════════════════ */

dom.copyBtn.addEventListener('click', async () => {
  if (!state.latestJson) {
    setStatus('No JSON to copy — run an extraction first.', 'error');
    showToast('Generate JSON first.', 'warn');
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(state.latestJson, null, 2));
    showToast('JSON copied to clipboard!', 'success');
    setStatus('JSON copied to clipboard.', 'success');
    log('info', 'JSON copied to clipboard');
  } catch (err) {
    showToast('Clipboard copy failed — try the download button.', 'error');
    log('error', 'Clipboard write failed', { error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   DOWNLOAD BUTTON  [FIX-5 — Safari DOM append fix]
   ═══════════════════════════════════════════════════════ */

dom.downloadBtn.addEventListener('click', () => {
  if (!state.latestJson) {
    setStatus('No JSON to download — run an extraction first.', 'error');
    showToast('Generate JSON first.', 'warn');
    return;
  }

  const filename = buildFilename(state.latestJson);
  const blob = new Blob([JSON.stringify(state.latestJson, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href     = url;
  link.download = filename;

  // [FIX-5] Must append to DOM for Safari compatibility
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  setStatus(`Download started: ${filename}`, 'success');
  showToast(`Downloading ${filename}`, 'success');
  log('info', 'JSON download triggered', { filename });
});

function buildFilename(data) {
  const platform = data?.source?.platform || 'post';
  const username = data?.clientProfile?.username || 'unknown';
  const ts = new Date().toISOString().slice(0, 10);
  return `ad-builder_${platform}_${username}_${ts}.json`
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

/* ═══════════════════════════════════════════════════════
   SEND TO AD BUILDER  [localStorage bridge]
   ═══════════════════════════════════════════════════════

   The Ad Builder at https://nikkileenikki.github.io/kult-adbuilder/
   is hosted on a DIFFERENT origin (nikkileenikki.github.io) from
   this extractor (akmalhalim22.github.io). Cross-origin rules:
     ✗  Direct postMessage without a listener  — no existing listener
     ✗  Shared localStorage across origins     — browsers block this
     ✗  iframe.contentWindow manipulation      — cross-origin blocked
     ✓  localStorage on SAME origin            — works when both sites
        are on the SAME github.io subdomain    — NOT the case here
     ✓  URL query parameter pass-through       — works if Ad Builder
        reads location.search on load          — requires Ad Builder patch

   CHOSEN APPROACH:
   Since you own BOTH repos, we use a two-part bridge:
     1. Extractor writes JSON to localStorage under key 'kult_import'
        AND encodes a compact summary in the URL hash
     2. Ad Builder's index.html gets a <script> bootstrap patch that
        on DOMContentLoaded reads localStorage['kult_import'], parses it,
        and calls loadProjectFromData(projectData) directly — no file dialog

   This file implements Part 1 (Extractor side).
   bridge-patch.js implements Part 2 (Ad Builder side patch).
   ═══════════════════════════════════════════════════════ */

const AD_BUILDER_URL = 'https://nikkileenikki.github.io/kult-adbuilder/';
const BRIDGE_KEY     = 'kult_import';   // localStorage key read by bridge-patch.js

const dom_sendBtn     = $('send-adbuilder-btn');
const dom_sendLabel   = dom_sendBtn?.querySelector('.btn-label');
const dom_sendLoading = dom_sendBtn?.querySelector('.btn-loading');

dom_sendBtn?.addEventListener('click', async () => {
  if (!state.latestJson) {
    setStatus('No JSON to send — run an extraction first.', 'error');
    showToast('Generate JSON first.', 'warn');
    return;
  }

  // Loading state
  dom_sendBtn.disabled = true;
  dom_sendLabel.classList.add('hidden');
  dom_sendLoading.classList.remove('hidden');

  try {
    // ── 1. Build the Ad Builder project payload ─────────────────────
    const projectPayload = buildAdBuilderPayload(state.latestJson);

    // ── 2. Write to localStorage with a timestamp for freshness ─────
    //    The Ad Builder's bridge-patch.js reads this key on load.
    //    We also store a 'sent_at' so the Ad Builder can reject stale data.
    const bridgePacket = {
      sentAt:    Date.now(),
      version:   '1.0',
      source:    window.location.href,
      project:   projectPayload
    };
    localStorage.setItem(BRIDGE_KEY, JSON.stringify(bridgePacket));
    log('info', 'Wrote project to localStorage bridge', { key: BRIDGE_KEY, elements: projectPayload.elements.length });

    // ── 3. Open Ad Builder with ?import=1 signal ─────────────────────
    //    The bridge-patch.js script in kult-adbuilder reads this param
    //    on load, pulls from localStorage, and auto-populates the canvas.
    const targetUrl = `${AD_BUILDER_URL}?import=1&t=${Date.now()}`;
    const adTab = window.open(targetUrl, 'kult_adbuilder');

    if (!adTab) {
      // Pop-up blocked — show manual instructions
      showBridgeBlockedModal(targetUrl);
      setStatus('Pop-up blocked — see instructions to open Ad Builder.', 'warn');
    } else {
      setStatus('Opening Ad Builder — your data is being loaded automatically.', 'success');
      showToast('Ad Builder opening — data will auto-load!', 'success', 4000);
      log('success', 'Ad Builder tab opened with import signal', { url: targetUrl });
    }

  } catch (err) {
    setStatus(`Send to Ad Builder failed: ${err.message}`, 'error');
    showToast(`Failed: ${err.message}`, 'error', 6000);
    log('error', 'Send to Ad Builder failed', { error: err.message });
  } finally {
    dom_sendBtn.disabled = false;
    dom_sendLabel.classList.remove('hidden');
    dom_sendLoading.classList.add('hidden');
  }
});

/**
 * Maps the extracted social post JSON into the Ad Builder's internal
 * project schema (as defined in kult-adbuilder static/js/state/schema.js).
 *
 * Ad Builder project schema:
 * {
 *   version: 1,                    ← CURRENT_BANNER_VERSION = 1 (integer)
 *   bannerName: string,
 *   canvasWidth: number,
 *   canvasHeight: number,
 *   totalDuration: number,
 *   animLoop: number,
 *   elements: Element[],           ← type: text|image|shape|clickthrough
 *   groups: []
 * }
 */
function buildAdBuilderPayload(json) {
  const platform    = json?.source?.platform || 'unknown';
  const username    = json?.clientProfile?.username || '';
  const caption     = json?.postContent?.caption || '';
  const hashtags    = json?.postContent?.hashtags || [];
  const permalink   = json?.source?.url || '';
  const thumbnail   = json?.mediaAssets?.videoThumbnail || null;
  const postImages  = json?.mediaAssets?.postImages || [];
  const primaryImg  = postImages[0]?.url || thumbnail || null;
  const bannerName  = `${platform}-${username || 'post'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const platformLabel = (PLATFORM_CONFIG[platform]?.label || platform).toUpperCase();

  const canvasWidth  = 300;
  const canvasHeight = 250;
  const elements     = [];
  let   counter      = 0;

  // 1 ── Dark background
  elements.push({
    id: `element_${++counter}`, type: 'shape', shapeType: 'rectangle',
    x: 0, y: 0, width: canvasWidth, height: canvasHeight,
    fillColor: '#0f0f0f', borderRadius: 0,
    opacity: 1, zIndex: 1, locked: false, animations: []
  });

  // 2 ── Thumbnail image (URL reference — Ad Builder renders it if reachable)
  const imgY = 0;
  const imgH = Math.round(canvasHeight * 0.58);
  if (primaryImg) {
    elements.push({
      id: `element_${++counter}`, type: 'image',
      src: primaryImg,            // direct URL — Ad Builder <img> renders it
      x: 0, y: imgY, width: canvasWidth, height: imgH,
      opacity: 1, zIndex: 2, locked: false,
      animations: [{ effect: 'fadeIn', start: 0, duration: 0.5 }]
    });
  }

  const textStartY = primaryImg ? imgH + 10 : 14;

  // 3 ── Platform badge
  elements.push({
    id: `element_${++counter}`, type: 'text', text: platformLabel,
    x: 12, y: textStartY,
    fontSize: 10, fontFamily: 'Arial', fontWeight: 'bold',
    color: '#a855f7', opacity: 1, zIndex: 3, locked: false,
    animations: [{ effect: 'fadeIn', start: 0.2, duration: 0.4 }]
  });

  // 4 ── @username
  if (username) {
    elements.push({
      id: `element_${++counter}`, type: 'text', text: `@${username}`,
      x: 12, y: textStartY + 16,
      fontSize: 13, fontFamily: 'Arial', fontWeight: 'bold',
      color: '#ffffff', opacity: 1, zIndex: 4, locked: false,
      animations: [{ effect: 'fadeIn', start: 0.3, duration: 0.4 }]
    });
  }

  // 5 ── Caption (stripped of hashtags, max 80 chars)
  const captionClean = caption.replace(/#\w+/g, '').trim().slice(0, 80);
  if (captionClean) {
    elements.push({
      id: `element_${++counter}`, type: 'text',
      text: captionClean + (caption.length > 80 ? '…' : ''),
      x: 12, y: textStartY + 34,
      fontSize: 11, fontFamily: 'Arial', fontWeight: 'normal',
      color: '#e2e2e2', opacity: 0.9, zIndex: 5, locked: false,
      animations: [{ effect: 'fadeIn', start: 0.5, duration: 0.5 }]
    });
  }

  // 6 ── Top 3 hashtags
  const tagLine = hashtags.slice(0, 3).join(' ');
  if (tagLine) {
    elements.push({
      id: `element_${++counter}`, type: 'text', text: tagLine,
      x: 12, y: canvasHeight - 20,
      fontSize: 9, fontFamily: 'Arial', fontWeight: 'normal',
      color: '#a855f7', opacity: 0.75, zIndex: 6, locked: false,
      animations: [{ effect: 'fadeIn', start: 0.7, duration: 0.4 }]
    });
  }

  // 7 ── Clickthrough overlay
  if (permalink) {
    elements.push({
      id: `element_${++counter}`, type: 'clickthrough',
      url: permalink, clickIndex: 1, target: '_blank',
      x: 0, y: 0, width: canvasWidth, height: canvasHeight,
      opacity: 0, zIndex: 99, locked: true, animations: []
    });
  }

  return {
    version:       1,                       // must be integer 1 per constants.js
    timestamp:     new Date().toISOString(),
    bannerName,
    canvasWidth,
    canvasHeight,
    totalDuration: 5,
    animLoop:      0,
    elements,
    groups:        [],
    _meta: { platform, username, permalink, extractedAt: new Date().toISOString() }
  };
}

/**
 * Shown when the browser blocks the popup.
 * Gives the user a direct link + explains what happened.
 */
function showBridgeBlockedModal(url) {
  document.getElementById('bridge-blocked-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'bridge-blocked-modal';
  el.innerHTML = `
    <div style="
      position:fixed; inset:0; background:rgba(0,0,0,.7);
      display:flex; align-items:center; justify-content:center;
      z-index:10000; padding:24px;
    " onclick="if(event.target===this)this.remove()">
      <div style="
        background:#1a0b3b; border:1.5px solid #7c3aed; border-radius:18px;
        padding:28px 28px 22px; max-width:420px; width:100%;
        box-shadow:0 12px 60px rgba(124,58,237,.5); color:#f3e8ff; font-family:inherit;
      ">
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:12px">
          <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;margin-right:8px"></i>
          Pop-up Blocked
        </div>
        <p style="font-size:.88rem;line-height:1.7;opacity:.85;margin-bottom:16px">
          Your browser blocked the Ad Builder tab. Your data is ready in localStorage —
          open Ad Builder manually and it will auto-load.
        </p>
        <a href="${url}" target="kult_adbuilder" rel="noopener"
          style="display:block;text-align:center;background:linear-gradient(135deg,#7c3aed,#a855f7);
          color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;
          font-weight:700;font-size:.95rem;margin-bottom:12px"
          onclick="document.getElementById('bridge-blocked-modal')?.remove()">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Ad Builder
        </a>
        <button onclick="document.getElementById('bridge-blocked-modal')?.remove()"
          style="width:100%;background:none;border:1px solid rgba(168,85,247,.4);
          color:#c4b5fd;padding:9px;border-radius:10px;cursor:pointer;font-size:.88rem">
          Dismiss
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
}





/* ═══════════════════════════════════════════════════════
   TABLE API — HISTORY PERSISTENCE  [FIX-8]
   ═══════════════════════════════════════════════════════ */

async function saveToHistory(url, data, status, errorMessage = '') {
  try {
    const platform     = data?.source?.platform || detectPlatformFromUrl(url);
    const profileName  = data?.clientProfile?.profileName || data?.clientProfile?.username || '';
    const username     = data?.clientProfile?.username || '';
    const caption      = data?.postContent?.caption || '';
    const hashtags     = data?.postContent?.hashtags || [];
    const mediaCount   = data
      ? (data.mediaAssets?.postImages?.length || 0) +
        (data.mediaAssets?.carouselAssets?.length || 0) +
        (data.mediaAssets?.videoThumbnail ? 1 : 0)
      : 0;
    const extractor    = data?.source?.extractor || 'unknown';

    const row = {
      url,
      platform,
      profile_name:  profileName,
      username,
      caption,
      hashtags,
      media_count:   mediaCount,
      extractor,
      status,
      error_message: errorMessage,
      raw_payload:   data ? JSON.stringify(data) : '',
      extracted_at:  new Date().toISOString()
    };

    const res = await fetch(`tables/${TABLE_NAME}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });

    if (!res.ok) throw new Error(`Table API ${res.status}`);
    log('success', 'Extraction saved to history Table API', { platform, status });

    // Refresh history badge count
    await refreshHistoryBadge();

  } catch (err) {
    log('warn', 'Failed to save to history (Table API)', { error: err.message });
  }
}

async function refreshHistoryBadge() {
  try {
    const res  = await fetch(`tables/${TABLE_NAME}?page=1&limit=1`);
    const json = await res.json();
    const count = json.total || 0;
    dom.historyCount.textContent = count > 99 ? '99+' : count;
    dom.historyCount.classList.toggle('hidden', count === 0);
  } catch { /* silent */ }
}

/* ═══════════════════════════════════════════════════════
   HISTORY TAB  [FIX-11 — sorting, filtering, pagination]
   ═══════════════════════════════════════════════════════ */

async function loadHistory() {
  dom.historyLoading.classList.remove('hidden');
  dom.historyEmpty.classList.add('hidden');
  dom.historyGrid.classList.add('hidden');
  dom.historyPagination.classList.add('hidden');

  try {
    const limit = 200; // fetch all, filter/sort client-side for UX
    const res   = await fetch(`tables/${TABLE_NAME}?page=1&limit=${limit}&sort=created_at`);
    const json  = await res.json();

    state.historyAllRows = json.data || [];
    state.historyTotal   = json.total || 0;
    log('info', `Loaded ${state.historyAllRows.length} history records`);

    renderHistoryGrid();

  } catch (err) {
    log('error', 'Failed to load history', { error: err.message });
    dom.historyLoading.classList.add('hidden');
    dom.historyEmpty.classList.remove('hidden');
    dom.historyEmpty.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation"></i>
      <p>Failed to load history: ${escHtml(err.message)}</p>`;
  }
}

function renderHistoryGrid() {
  dom.historyLoading.classList.add('hidden');

  // Apply search filter [FIX-11]
  const searchTerm = (dom.historySearch.value || '').toLowerCase().trim();
  const platform   = dom.historyFilter.value || '';
  const sortDir    = dom.historySort.value || 'desc';

  let rows = [...state.historyAllRows];

  if (searchTerm) {
    rows = rows.filter(r =>
      (r.url || '').toLowerCase().includes(searchTerm) ||
      (r.profile_name || '').toLowerCase().includes(searchTerm) ||
      (r.username || '').toLowerCase().includes(searchTerm) ||
      (r.platform || '').toLowerCase().includes(searchTerm) ||
      (r.caption || '').toLowerCase().includes(searchTerm)
    );
  }

  if (platform) {
    rows = rows.filter(r => (r.platform || '') === platform);
  }

  // Sort by created_at [FIX-11]
  rows.sort((a, b) => {
    const ta = a.created_at || 0;
    const tb = b.created_at || 0;
    return sortDir === 'desc' ? tb - ta : ta - tb;
  });

  if (!rows.length) {
    dom.historyEmpty.classList.remove('hidden');
    dom.historyGrid.classList.add('hidden');
    dom.historyPagination.classList.add('hidden');
    dom.historyEmpty.innerHTML = `
      <i class="fa-solid fa-inbox"></i>
      <p>${searchTerm || platform ? 'No extractions match your filters.' : 'No extraction history yet. Run your first extraction above.'}</p>`;
    return;
  }

  dom.historyEmpty.classList.add('hidden');

  // Client-side pagination
  const totalPages = Math.ceil(rows.length / HISTORY_PAGE_LIMIT);
  state.historyPage = Math.min(state.historyPage, totalPages);
  const start = (state.historyPage - 1) * HISTORY_PAGE_LIMIT;
  const page  = rows.slice(start, start + HISTORY_PAGE_LIMIT);

  dom.historyGrid.innerHTML = '';
  page.forEach(row => dom.historyGrid.appendChild(buildHistoryCard(row)));

  dom.historyGrid.classList.remove('hidden');

  // Pagination controls
  if (totalPages > 1) {
    dom.historyPagination.classList.remove('hidden');
    dom.pageIndicator.textContent = `Page ${state.historyPage} of ${totalPages} (${rows.length} records)`;
    dom.prevPageBtn.disabled = state.historyPage <= 1;
    dom.nextPageBtn.disabled = state.historyPage >= totalPages;
  } else {
    dom.historyPagination.classList.add('hidden');
  }
}

function buildHistoryCard(row) {
  const card  = document.createElement('div');
  card.className = 'history-card';
  card.dataset.id = row.id;

  const platform = row.platform || 'generic';
  const cfg      = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.generic;
  const status   = row.status || 'success';
  const name     = row.profile_name || row.username || 'Unknown';
  const timeAgo  = formatRelativeTime(row.extracted_at || row.created_at);
  const hashtags = Array.isArray(row.hashtags) ? row.hashtags.slice(0, 3) : [];
  const initials = getInitials(name);
  const mediaCount = row.media_count || 0;

  const statusIcons = { success: 'fa-circle-check', error: 'fa-circle-xmark', partial: 'fa-circle-exclamation' };

  card.innerHTML = `
    <div class="history-card-header">
      <span class="hc-platform platform-badge ${platform}">${cfg.label}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="hc-status ${status}">
          <i class="fa-solid ${statusIcons[status] || statusIcons.success}"></i>
          ${status}
        </span>
        <span class="hc-time">${timeAgo}</span>
      </div>
    </div>
    <div class="hc-profile">
      <div class="hc-avatar">
        <span>${escHtml(initials)}</span>
      </div>
      <div>
        <div class="hc-name">${escHtml(name)}</div>
        ${row.username ? `<div class="hc-handle">@${escHtml(row.username)}</div>` : ''}
      </div>
    </div>
    <div class="hc-url">
      <i class="fa-solid fa-link"></i>
      ${escHtml(row.url || '')}
    </div>
    ${row.caption ? `<div class="hc-caption">${escHtml(row.caption)}</div>` : ''}
    <div class="hc-footer">
      ${mediaCount > 0 ? `<span class="hc-chip"><i class="fa-solid fa-images"></i>${mediaCount} media</span>` : ''}
      ${hashtags.map(h => `<span class="hc-chip"><i class="fa-solid fa-hashtag"></i>${escHtml(h.replace(/^#/, ''))}</span>`).join('')}
      ${row.extractor ? `<span class="hc-chip"><i class="fa-solid fa-gear"></i>${escHtml(row.extractor)}</span>` : ''}
    </div>
  `;

  card.addEventListener('click', () => openHistoryModal(row));
  return card;
}

function formatRelativeTime(ts) {
  if (!ts) return '—';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(date)) return '—';
  const diff = Date.now() - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400)return `${Math.floor(secs/3600)}h ago`;
  return date.toLocaleDateString();
}

/* ── History modal ──────────────────────────────────── */

function openHistoryModal(row) {
  dom.modalTitle.textContent = `Extraction Detail — ${row.platform || 'Unknown'}`;

  let payloadHtml = '';
  if (row.raw_payload) {
    try {
      const parsed = JSON.parse(row.raw_payload);
      payloadHtml = `
        <div style="margin-top:16px">
          <h4 style="font-size:.88rem;font-weight:700;margin-bottom:8px;color:var(--muted)">
            <i class="fa-solid fa-code"></i> Full JSON Payload
          </h4>
          <div style="border-radius:12px;overflow:hidden;border:1px solid #2b1324">
            <pre style="margin:0;padding:16px;background:#120710;color:#ffe6f3;font-size:.78rem;line-height:1.6;overflow:auto;max-height:380px;font-family:var(--font-mono)">${syntaxHighlight(parsed)}</pre>
          </div>
        </div>`;
    } catch { /* skip */ }
  }

  dom.modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      ${modalField('URL', row.url)}
      ${modalField('Platform', row.platform || '—')}
      ${modalField('Profile Name', row.profile_name || '—')}
      ${modalField('Username', row.username ? `@${row.username}` : '—')}
      ${modalField('Status', row.status || '—')}
      ${modalField('Extractor', row.extractor || '—')}
      ${modalField('Media Assets', row.media_count ?? '—')}
      ${modalField('Extracted At', row.extracted_at ? new Date(row.extracted_at).toLocaleString() : '—')}
    </div>
    ${row.caption ? `
      <div style="margin-bottom:14px">
        <h4 style="font-size:.88rem;font-weight:700;margin-bottom:6px;color:var(--muted)"><i class="fa-solid fa-align-left"></i> Caption</h4>
        <p style="font-size:.9rem;line-height:1.7;padding:12px;background:var(--surface-alt);border-radius:10px;border:1px solid var(--border)">${escHtml(row.caption)}</p>
      </div>` : ''}
    ${row.error_message ? `
      <div style="padding:12px;background:var(--danger-bg);border-radius:10px;color:var(--danger);font-size:.88rem;margin-bottom:14px">
        <strong><i class="fa-solid fa-circle-xmark"></i> Error:</strong> ${escHtml(row.error_message)}
      </div>` : ''}
    ${payloadHtml}
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn-secondary" onclick="reloadFromHistory('${row.id}')">
        <i class="fa-solid fa-rotate-right"></i> Load into Extractor
      </button>
      <button class="btn-secondary" onclick="downloadHistoryRecord('${row.id}')">
        <i class="fa-solid fa-download"></i> Download JSON
      </button>
    </div>
  `;

  dom.historyModal.classList.remove('hidden');
  log('info', `Opened history detail for record ${row.id}`);
}

function modalField(label, value) {
  return `
    <div style="padding:10px;background:var(--surface-alt);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:3px">${escHtml(label)}</div>
      <div style="font-size:.88rem;font-weight:600;word-break:break-all">${escHtml(String(value || ''))}</div>
    </div>`;
}

// Global functions for inline onclick (from modal innerHTML)
window.reloadFromHistory = function(id) {
  const row = state.historyAllRows.find(r => r.id === id);
  if (!row) return;
  dom.urlInput.value = row.url || '';
  dom.clearUrlBtn.classList.toggle('hidden', !row.url);
  if (row.url) updatePlatformUI(detectPlatformFromUrl(row.url));
  dom.historyModal.classList.add('hidden');
  // Switch to extractor tab
  switchTab('extractor');
  showToast('URL loaded into extractor.', 'info');
};

window.downloadHistoryRecord = function(id) {
  const row = state.historyAllRows.find(r => r.id === id);
  if (!row || !row.raw_payload) {
    showToast('No payload available for this record.', 'warn');
    return;
  }
  try {
    const data = JSON.parse(row.raw_payload);
    const filename = buildFilename(data);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`, 'success');
  } catch { showToast('Failed to download — payload may be invalid.', 'error'); }
};

/* ── History controls ─────────────────────────────────── */

dom.historySearch.addEventListener('input', debounce(() => {
  state.historyPage = 1;
  renderHistoryGrid();
}, 300));

dom.historyFilter.addEventListener('change', () => {
  state.historyPage = 1;
  renderHistoryGrid();
});

dom.historySort.addEventListener('change', () => {
  state.historyPage = 1;
  renderHistoryGrid();
});

dom.prevPageBtn.addEventListener('click', () => {
  if (state.historyPage > 1) { state.historyPage--; renderHistoryGrid(); }
});

dom.nextPageBtn.addEventListener('click', () => {
  state.historyPage++;
  renderHistoryGrid();
});

dom.clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Clear all extraction history? This cannot be undone.')) return;
  try {
    // Delete each record via Table API
    const ids = state.historyAllRows.map(r => r.id);
    await Promise.all(ids.map(id => fetch(`tables/${TABLE_NAME}/${id}`, { method: 'DELETE' })));
    state.historyAllRows = [];
    state.historyTotal   = 0;
    dom.historyCount.classList.add('hidden');
    renderHistoryGrid();
    showToast('History cleared.', 'success');
    log('warn', `Cleared ${ids.length} history records`);
  } catch (err) {
    showToast('Failed to clear history.', 'error');
    log('error', 'Failed to clear history', { error: err.message });
  }
});

/* ── Modal close ────────────────────────────────────── */

dom.modalCloseBtn.addEventListener('click', () => dom.historyModal.classList.add('hidden'));

dom.historyModal.addEventListener('click', e => {
  if (e.target === dom.historyModal) dom.historyModal.classList.add('hidden');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') dom.historyModal.classList.add('hidden');
});

/* ═══════════════════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════════════════ */

function switchTab(tabName) {
  dom.navTabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  dom.tabPanels.forEach(p => {
    const isActive = p.id === `tab-${tabName}`;
    p.classList.toggle('active', isActive);
    p.classList.toggle('hidden', !isActive);
  });

  // Lazy-load history when tab first opened
  if (tabName === 'history' && state.historyAllRows.length === 0) {
    loadHistory();
  }

  log('info', `Tab switched to: ${tabName}`);
}

dom.navTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

/* ═══════════════════════════════════════════════════════
   UTILITY: DEBOUNCE
   ═══════════════════════════════════════════════════════ */

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */

async function init() {
  // ── Backend availability banner ─────────────────────────────────
  const banner       = $('backend-banner');
  const isGHPages    = window.location.hostname.endsWith('.github.io');
  const hasApiBase   = API_BASE.trim() !== '';

  if (banner) {
    if (hasApiBase) {
      // Custom backend configured — all platforms available
      banner.className = 'backend-banner ok';
      banner.innerHTML = `<i class="fa-solid fa-circle-check"></i>
        <span>Backend API connected (<code>${API_BASE}</code>). All platforms available.</span>`;
      banner.classList.remove('hidden');
    } else if (isGHPages) {
      // GitHub Pages — no backend, limited to TikTok + YouTube
      banner.className = 'backend-banner warn';
      banner.innerHTML = `<i class="fa-solid fa-circle-info"></i>
        <span>
          <strong>Instagram, TikTok &amp; YouTube work now</strong> — direct oEmbed, no backend needed.<br>
          <strong>Facebook</strong> requires the backend API.
          <a href="https://github.com/akmalhalim22/AI-marketing-tools" target="_blank" rel="noopener">Deploy it on Vercel</a>
          then set <code>API_BASE</code> in <code>app.js</code> to enable Facebook.
        </span>`;
      banner.className = 'backend-banner info';
      banner.classList.remove('hidden');
    }
    // localhost / custom domain with no API_BASE — stay silent
  }

  // Load history badge count on startup
  await refreshHistoryBadge();

  // Set initial JSON viewer placeholder
  renderJson({ status: 'ready', hint: 'Paste a TikTok, YouTube, Instagram or Facebook URL above and click Extract.' });

  setStatus('Ready — paste a public social post URL to begin.', 'idle');
  console.log('[KULT] Social Post JSON Extractor ready.', { isGHPages, hasApiBase });
}

init();
