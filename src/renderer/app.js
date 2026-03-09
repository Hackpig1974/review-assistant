// ── State ─────────────────────────────────────────────────────────────────────
let config = {};
let folders = [];
let isProcessing = false;

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  config = await window.api.getConfig();
  applyTheme(config.theme || 'dark');
  await refreshFolders();

  const { version, releasesUrl } = await window.api.getVersion();
  document.getElementById('credits-version').textContent = `v${version}`;

  // Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.api.close());

  // Toolbar
  document.getElementById('btn-refresh').addEventListener('click', refreshFolders);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-submit').addEventListener('click', onSubmit);

  // Settings modal
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('cfg-browse').addEventListener('click', browseFolder);
  document.getElementById('cfg-save').addEventListener('click', saveSettings);
  document.getElementById('cfg-api-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.api.openExternal('https://console.anthropic.com/settings/keys');
  });

  // Login dialog
  document.getElementById('btn-login-done').addEventListener('click', () => {
    document.getElementById('login-overlay').style.display = 'none';
    window.api.confirmLogin();
  });

  // Update banner
  document.getElementById('update-dismiss').addEventListener('click', () => {
    document.getElementById('update-banner').style.display = 'none';
  });

  // Events from main process
  window.api.onUpdateAvailable((version) => {
    const banner = document.getElementById('update-banner');
    const text = document.getElementById('update-text');
    text.textContent = `▲ Version ${version} available — click to download`;
    text.onclick = () => window.api.openExternal(releasesUrl);
    banner.style.display = 'flex';

    const upd = document.getElementById('credits-update');
    upd.textContent = `→ v${version} available`;
    upd.style.display = 'inline';
    upd.onclick = (e) => { e.preventDefault(); window.api.openExternal(releasesUrl); };
  });

  window.api.onLoginRequired(() => {
    document.getElementById('login-overlay').style.display = 'flex';
  });

  window.api.onStatusUpdate((msg) => setStatus(msg));

  window.api.onBrowserClosed(() => {
    isProcessing = false;
    const btn = document.getElementById('btn-submit');
    btn.disabled = false;
    btn.textContent = '✅ Finished';
    setTimeout(() => { btn.textContent = '▶ Generate & Open Reviews'; }, 3000);
    refreshFolders();
  });
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  applyThemeWithSystem(theme);
}

function applyThemeWithSystem(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
  }
}

// ── Folders ───────────────────────────────────────────────────────────────────
async function refreshFolders() {
  saveFolderFieldsToMemory();
  folders = await window.api.scanFolders(config.rootFolder);
  renderFolders();
  updatePathBar();
}

function updatePathBar() {
  const el = document.getElementById('path-display');
  el.textContent = config.rootFolder
    ? `📂 ${config.rootFolder}`
    : '⚠ No root folder set — open Settings to configure';
}

function renderFolders() {
  const list = document.getElementById('folder-list');
  const empty = document.getElementById('empty-state');

  // Clear existing cards
  list.querySelectorAll('.folder-card').forEach(el => el.remove());

  if (!folders.length) {
    empty.style.display = 'block';
    setStatus('No folders found.');
    return;
  }
  empty.style.display = 'none';

  folders.forEach((folder, idx) => {
    const card = buildFolderCard(folder, idx);
    list.appendChild(card);
  });

  setStatus(`${folders.length} folder${folders.length !== 1 ? 's' : ''} found · select to review`);
}

function buildFolderCard(folder, idx) {
  const card = document.createElement('div');
  card.className = 'folder-card';
  card.dataset.idx = idx;

  const picLabel = folder.imageCount > 0
    ? `  (Pictures = ${folder.imageCount})`
    : '  (No pictures)';

  card.innerHTML = `
    <div class="folder-header">
      <input type="checkbox" class="folder-checkbox" data-idx="${idx}">
      <span class="folder-name">📁 ${folder.name}${picLabel}</span>
      <span class="folder-chevron">›</span>
    </div>
    <div class="folder-body">
      <label class="field-label">🛒 Product Page URL</label>
      <input type="text" class="text-input field-product-url" placeholder="https://www.hamandron.com/product/XXXXXXXXXX" value="${folder.productUrl || ''}">
      <label class="field-label">✏️ Review Submission URL</label>
      <input type="text" class="text-input field-review-url" placeholder="https://www.hamandron.com/review/create?id=XXXXXXXXXX" value="${folder.reviewUrl || ''}">
      <label class="field-label">📝 Notes (optional — AI will incorporate these)</label>
      <textarea class="text-input field-notes" placeholder="Any context for the AI...">${folder.notes || ''}</textarea>
    </div>
  `;

  // Checkbox toggle
  const checkbox = card.querySelector('.folder-checkbox');
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    if (checkbox.checked) {
      card.classList.add('expanded');
    } else {
      card.classList.remove('expanded');
    }
  });

  // Header click toggles expand (but not via checkbox)
  const header = card.querySelector('.folder-header');
  header.addEventListener('click', (e) => {
    if (e.target === checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
  });

  return card;
}

function saveFolderFieldsToMemory() {
  document.querySelectorAll('.folder-card').forEach(card => {
    const idx = parseInt(card.dataset.idx);
    if (isNaN(idx) || !folders[idx]) return;
    folders[idx].productUrl = card.querySelector('.field-product-url')?.value || '';
    folders[idx].reviewUrl  = card.querySelector('.field-review-url')?.value  || '';
    folders[idx].notes      = card.querySelector('.field-notes')?.value       || '';
  });
}

function getSelectedFolders() {
  saveFolderFieldsToMemory();
  return document.querySelectorAll('.folder-card').length
    ? [...document.querySelectorAll('.folder-card')]
        .filter(card => card.querySelector('.folder-checkbox')?.checked)
        .map(card => {
          const idx = parseInt(card.dataset.idx);
          return folders[idx];
        })
    : [];
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('cfg-root-folder').value = config.rootFolder || '';
  document.getElementById('cfg-api-key').value = config.anthropicApiKey || '';
  document.getElementById('cfg-platform-url').value = config.reviewPlatformUrl || 'hamandron.com';
  // Highlight active theme button
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (config.theme || 'dark'));
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      config.theme = btn.dataset.theme;
      applyThemeWithSystem(config.theme);
    });
  });
  document.getElementById('settings-overlay').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

async function browseFolder() {
  const path = await window.api.browseFolder();
  if (path) document.getElementById('cfg-root-folder').value = path;
}

async function saveSettings() {
  const newConfig = {
    rootFolder: document.getElementById('cfg-root-folder').value.trim(),
    anthropicApiKey: document.getElementById('cfg-api-key').value.trim(),
    reviewPlatformUrl: document.getElementById('cfg-platform-url').value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '') || 'amazon.com',
    theme: config.theme || 'dark'
  };
  await window.api.saveConfig(newConfig);
  config = { ...config, ...newConfig };
  closeSettings();
  await refreshFolders();
}

// ── Submit / process ──────────────────────────────────────────────────────────
async function onSubmit() {
  if (isProcessing) return;

  const selected = getSelectedFolders();
  if (!selected.length) { setStatus('⚠ No folders selected.', true); return; }

  const missing = selected.filter(f => !f.reviewUrl);
  if (missing.length) { setStatus(`⚠ ${missing.length} folder(s) missing Review URL`, true); return; }

  if (!config.anthropicApiKey) {
    setStatus('⚠ No API key set — open Settings.', true); return;
  }

  // Save all field values to disk before processing
  for (const folder of folders) {
    await window.api.saveFolderData({
      folderPath: folder.path,
      productUrl: folder.productUrl,
      reviewUrl: folder.reviewUrl,
      notes: folder.notes
    });
  }

  isProcessing = true;
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = '⏳ Processing...';

  setStatus('🤖 Generating reviews...');

  try {
    const reviews = await window.api.generateReviews({
      selections: selected.map(f => ({
        folderName: f.name,
        folderPath: f.path,
        productUrl: f.productUrl,
        reviewUrl: f.reviewUrl,
        notes: f.notes
      })),
      apiKey: config.anthropicApiKey
    });

    setStatus('🌐 Opening browser...');

    await window.api.openReviewTabs({
      reviews,
      platformUrl: config.reviewPlatformUrl || 'amazon.com'
    });

  } catch (err) {
    setStatus(`⚠ Error: ${err.message}`, true);
    isProcessing = false;
    btn.disabled = false;
    btn.textContent = '▶ Generate & Open Reviews';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, isWarning = false) {
  const el = document.getElementById('status-text');
  el.textContent = msg;
  el.style.color = isWarning ? 'var(--accent)' : 'var(--text-muted)';
  if (isWarning) setTimeout(() => { el.style.color = 'var(--text-muted)'; }, 3000);
}
