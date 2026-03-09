const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');

// ── Config store ──────────────────────────────────────────────────────────────
const store = new Store({
  name: 'config',
  defaults: {
    rootFolder: '',
    anthropicApiKey: '',
    reviewPlatformUrl: 'hamandron.com',
    theme: 'dark',
    windowBounds: { width: 760, height: 720 }
  }
});

// ── Version / update check ────────────────────────────────────────────────────
const VERSION = '1.0.0';
const GITHUB_API = 'https://api.github.com/repos/Hackpig1974/review-assistant/releases/latest';
const RELEASES_URL = 'https://github.com/Hackpig1974/review-assistant/releases/latest';

function checkForUpdate(callback) {
  const options = {
    hostname: 'api.github.com',
    path: '/repos/Hackpig1974/amazon-vine-reviews/releases/latest',
    headers: { 'User-Agent': 'review-assistant', 'Accept': 'application/vnd.github+json' }
  };
  const req = https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const tag = (json.tag_name || '').replace(/^v/, '');
        if (tag && isNewer(tag, VERSION)) callback(tag);
        else callback(null);
      } catch { callback(null); }
    });
  });
  req.on('error', () => callback(null));
  req.setTimeout(5000, () => { req.destroy(); callback(null); });
}

function isNewer(remote, local) {
  try {
    const r = remote.split('.').map(Number);
    const l = local.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (r[i] > l[i]) return true;
      if (r[i] < l[i]) return false;
    }
    return false;
  } catch { return false; }
}

// ── Window management ─────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 640,
    minHeight: 540,
    frame: false,
    backgroundColor: '#0f1420',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });
}

app.whenReady().then(() => {
  createWindow();
  setTimeout(() => {
    checkForUpdate((version) => {
      if (version && mainWindow) {
        mainWindow.webContents.send('update-available', version);
      }
    });
  }, 2000);
});

app.on('window-all-closed', () => app.quit());

// ── IPC: Config ───────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => store.store);
ipcMain.handle('save-config', (_, cfg) => { store.set(cfg); return true; });
ipcMain.handle('get-version', () => ({ version: VERSION, releasesUrl: RELEASES_URL }));

ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Review Root Folder'
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

// ── IPC: Folder scanning ──────────────────────────────────────────────────────
ipcMain.handle('scan-folders', (_, rootPath) => {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const imageExts = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff']);
  try {
    return fs.readdirSync(rootPath)
      .filter(name => fs.statSync(path.join(rootPath, name)).isDirectory())
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(name => {
        const dir = path.join(rootPath, name);
        const files = fs.readdirSync(dir);
        const imageCount = files.filter(f => imageExts.has(path.extname(f).toLowerCase())).length;
        const readTxt = (fname) => {
          const fp = path.join(dir, fname);
          return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8').trim() : '';
        };
        return {
          name,
          path: dir,
          imageCount,
          productUrl: readTxt('product_url.txt'),
          reviewUrl: readTxt('review_url.txt'),
          notes: readTxt('notes.txt')
        };
      });
  } catch { return []; }
});

ipcMain.handle('save-folder-data', (_, { folderPath, productUrl, reviewUrl, notes }) => {
  const write = (fname, val) => {
    const fp = path.join(folderPath, fname);
    if (val) fs.writeFileSync(fp, val, 'utf8');
    else if (fs.existsSync(fp)) fs.unlinkSync(fp);
  };
  write('product_url.txt', productUrl);
  write('review_url.txt', reviewUrl);
  write('notes.txt', notes);
  return true;
});

// ── IPC: AI review generation ─────────────────────────────────────────────────
ipcMain.handle('generate-reviews', async (_, { selections, apiKey }) => {
  const client = new Anthropic({ apiKey });
  const results = [];

  for (const sel of selections) {
    // Scrape product page
    let product = { title: sel.folderName, bullets: [], description: '' };
    if (sel.productUrl) {
      try {
        const { chromium: cr } = require('playwright');
        // Use a lightweight fetch for scraping instead of full browser
        const https2 = require('https');
        const http2 = require('http');
        product = await scrapeProduct(sel.productUrl) || product;
      } catch {}
    }

    // Generate review
    const bullets = product.bullets.length
      ? product.bullets.map(b => `- ${b}`).join('\n')
      : '(none)';
    const notesSection = sel.notes ? `\nReviewer notes: ${sel.notes}` : '';

    const prompt = `You are writing a product review. Write an honest, helpful, and natural-sounding review.

Product: ${product.title || sel.folderName}
Product features:\n${bullets}
Product description: ${product.description || '(not available)'}${notesSection}

Guidelines:
- Write a short punchy review TITLE (max 8 words, no quotes)
- Write a review BODY of 3 to 5 paragraphs, conversational tone
- Mention specific product features naturally
- Include one minor critique or caveat to sound authentic
- Do NOT use marketing language or superlatives like "amazing" or "perfect"

Respond in exactly this format with no extra text:
TITLE: <your title here>
BODY:
<your review body here>`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = message.content[0].text.trim();
    let title = '', body = raw;
    if (raw.startsWith('TITLE:')) {
      const lines = raw.split('\n');
      title = lines[0].replace('TITLE:', '').trim();
      const bodyStart = lines.findIndex(l => l.trim() === 'BODY:');
      body = bodyStart >= 0 ? lines.slice(bodyStart + 1).join('\n').trim() : lines.slice(1).join('\n').trim();
    }

    // Save to folder
    fs.writeFileSync(path.join(sel.folderPath, 'generated_review.txt'), `TITLE: ${title}\n\n${body}`, 'utf8');
    results.push({ folderName: sel.folderName, reviewUrl: sel.reviewUrl, title, body });
  }
  return results;
});

// ── Product scraper ───────────────────────────────────────────────────────────
function scrapeProduct(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };
    protocol.get(url, options, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          const titleMatch = html.match(/id="productTitle"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
          const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          const bullets = [];
          const bulletRe = /<span class="a-list-item">([\s\S]*?)<\/span>/g;
          let m;
          while ((m = bulletRe.exec(html)) !== null && bullets.length < 8) {
            const text = m[1].replace(/<[^>]+>/g, '').trim();
            if (text) bullets.push(text);
          }
          const descMatch = html.match(/id="productDescription"[\s\S]*?<p>([\s\S]*?)<\/p>/);
          const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 600) : '';
          resolve({ title, bullets, description });
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// ── IPC: Browser automation ───────────────────────────────────────────────────
let browserContext = null;

ipcMain.handle('open-review-tabs', async (event, { reviews, platformUrl }) => {
  const sessionDir = path.join(app.getPath('userData'), 'browser-session');
  fs.mkdirSync(sessionDir, { recursive: true });

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  // Check login
  const pages = browserContext.pages();
  const checkPage = pages[0] || await browserContext.newPage();
  await checkPage.goto(`https://www.${platformUrl}`, { timeout: 20000 });
  await checkPage.waitForLoadState('domcontentloaded');

  const needsLogin = await checkPage.evaluate(() => {
    const el = document.querySelector('#nav-link-accountList-nav-line-1');
    return el ? el.innerText.toLowerCase().includes('sign in') : false;
  }).catch(() => false);

  if (needsLogin) {
    await checkPage.goto(
      `https://www.${platformUrl}/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.${platformUrl}%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=usflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0`
    );
    event.sender.send('login-required');
    await new Promise(resolve => ipcMain.once('login-confirmed', resolve));
  }

  // Reuse checkPage for the first review tab instead of closing it
  let firstPage = null;
  let reuseCheckPage = true;

  for (let i = 0; i < reviews.length; i++) {
    const rev = reviews[i];
    event.sender.send('status-update', `Opening tab ${i + 1}/${reviews.length}: ${rev.folderName}...`);
    const page = reuseCheckPage ? (reuseCheckPage = false, checkPage) : await browserContext.newPage();
    try {
      await page.goto(rev.reviewUrl, { timeout: 20000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await pasteReview(page, rev.title, rev.body);
      await clickFiveStars(page);
      if (!firstPage) firstPage = page;
    } catch (e) {
      event.sender.send('status-update', `⚠ Tab ${i + 1} error: ${e.message}`);
    }
  }

  if (firstPage) await firstPage.bringToFront();
  event.sender.send('status-update', `✅ ${reviews.length} tab${reviews.length !== 1 ? 's' : ''} ready — adjust stars if needed, then submit.`);

  await browserContext.waitForEvent('close').catch(() => {});
  browserContext = null;
  event.sender.send('browser-closed');
});

ipcMain.on('login-confirmed', () => {});

// ── Paste review into form ────────────────────────────────────────────────────
async function pasteReview(page, title, body) {
  const titleSelectors = [
    'input[name="title"]', '#reviewTitle',
    'input[id*="title"]', 'input[data-hook="review-title-input"]'
  ];
  for (const sel of titleSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) { await el.fill(title); break; }
    } catch {}
  }

  const bodySelectors = [
    'textarea[name="description"]', '#reviewText',
    'textarea[id*="review"]', 'div[data-hook="review-text-input"] textarea', 'textarea'
  ];
  for (const sel of bodySelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) { await el.fill(body); return; }
    } catch {}
  }
}

// ── Click 5 stars ─────────────────────────────────────────────────────────────
async function clickFiveStars(page) {
  try {
    const el = page.locator('span[aria-label="select to rate item five star."]').first();
    if (await el.isVisible({ timeout: 3000 })) { await el.click(); return; }
  } catch {}
  try {
    const stars = page.locator('div[role="radiogroup"] span[role="radio"]');
    if (await stars.count() >= 5) { await stars.nth(4).click(); return; }
  } catch {}
}

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
ipcMain.on('confirm-login', () => ipcMain.emit('login-confirmed'));
