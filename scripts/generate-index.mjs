import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const PLANS_DIR = path.join(ROOT, 'plans');
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_PLANS_DIR = path.join(DIST_DIR, 'plans');

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanText(str = '') {
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html, fallback) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) return cleanText(titleMatch[1]);

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return cleanText(h1Match[1]);

  return fallback;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function normalizeDateLabel(monthText, startDay, endDay, year) {
  const mon = monthText.slice(0, 3).replace(/^./, c => c.toUpperCase()).toLowerCase();
  const properMonth = mon.charAt(0).toUpperCase() + mon.slice(1);
  if (endDay) {
    return `${properMonth} ${Number(startDay)}–${Number(endDay)}, ${Number(year)}`;
  }
  return `${properMonth} ${Number(startDay)}, ${Number(year)}`;
}

function extractDateInfo(text) {
  // Accept normal date ranges ("Jun 29–30, 2026") and the arrow/slash
  // notation used by some plan titles ("Jun 29→30" or "Jun 29/30").
  const direct = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:\s*[–—\-/→]\s*(\d{1,2}))?,\s*(\d{4})\b/i);
  if (direct) {
    const month = MONTHS[direct[1].slice(0, 3).toLowerCase()];
    const day = Number(direct[3] || direct[2]);
    const year = Number(direct[4]);
    return {
      sortDate: new Date(Date.UTC(year, month, day)),
      label: normalizeDateLabel(direct[1], direct[2], direct[3], direct[4]),
    };
  }

  // Filenames commonly use compact forms such as "Jun30_2026" or
  // ranges such as "Jun10-11_2026". Keep the year as a four-digit token so
  // it cannot be split and mistaken for a second day.
  const filenameStyle = text.match(/(?:^|[^A-Za-z])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[_\- ]?(\d{1,2})(?:[_\-–—→ ]+(\d{1,2}))?[_\- ,]+(\d{4})(?!\d)/i);
  if (filenameStyle) {
    const month = MONTHS[filenameStyle[1].slice(0, 3).toLowerCase()];
    const day = Number(filenameStyle[3] || filenameStyle[2]);
    const year = Number(filenameStyle[4]);
    return {
      sortDate: new Date(Date.UTC(year, month, day)),
      label: normalizeDateLabel(filenameStyle[1], filenameStyle[2], filenameStyle[3], filenameStyle[4]),
    };
  }

  return null;
}

function slugifyFileName(fileName, used) {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'plan';

  let slug = `${base}${ext}`;
  let i = 2;
  while (used.has(slug)) {
    slug = `${base}-${i}${ext}`;
    i += 1;
  }
  used.add(slug);
  return slug;
}

function extractVersionLabel(title, fileName) {
  const parts = title.split('—').map(part => part.trim()).filter(Boolean);
  let label = '';

  if (parts.length >= 3) {
    label = parts.slice(2).join(' — ');
  } else if (parts.length === 2) {
    label = parts[1];
  }

  if (!label) {
    label = path.basename(fileName, path.extname(fileName))
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (/^ES RTH Plan/i.test(title) && !/^RTH\b/i.test(label)) {
    label = `RTH · ${label}`;
  }

  return label;
}

function versionPriority(versionLabel) {
  const upper = versionLabel.toUpperCase();
  if (upper.includes('OPEN UPDATE')) return 0;
  if (upper.includes('UPDATED')) return 1;
  if (upper.includes('UPDATE')) return 2;
  if (upper.includes('ETH + RTH')) return 3;
  if (upper.includes('RTH')) return 4;
  return 5;
}

function toManifestItem(fileName, usedSlugs) {
  const fullPath = path.join(PLANS_DIR, fileName);
  const html = fs.readFileSync(fullPath, 'utf8');
  const stat = fs.statSync(fullPath);
  const title = extractTitle(html, fileName);
  const dateInfo = extractDateInfo(title) || extractDateInfo(fileName);
  const sortDate = dateInfo?.sortDate || new Date(stat.mtimeMs);
  const dateGroupLabel = dateInfo?.label || formatDate(sortDate);
  const versionLabel = extractVersionLabel(title, fileName);
  const slug = slugifyFileName(fileName, usedSlugs);
  const outputPath = path.join(DIST_PLANS_DIR, slug);
  fs.copyFileSync(fullPath, outputPath);
  const hash = crypto.createHash('sha1').update(html).digest('hex');

  return {
    fileName,
    slug,
    title,
    href: `plans/${slug}`,
    sortDate: sortDate.toISOString(),
    uploadTime: stat.mtime.toISOString(),
    dateLabel: formatDate(sortDate),
    dateGroupLabel,
    versionLabel,
    versionSort: versionPriority(versionLabel),
    hash,
  };
}

function buildIndexHtml(plans) {
  const manifestJson = JSON.stringify(plans, null, 2);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ES Trading Plans</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #111a2b;
      --panel-2: #18243a;
      --line: #27344d;
      --text: #eef4ff;
      --muted: #a7b6d4;
      --accent: #6cb6ff;
      --accent-2: #93c5fd;
      --shadow: 0 10px 30px rgba(0,0,0,.25);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, #0b1220 0%, #0d1526 100%);
    }
    .app {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }
    .topbar {
      padding: 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(11,18,32,.92);
      backdrop-filter: blur(8px);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .topbar-inner {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
    .headline {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 10px 14px;
    }
    h1 {
      margin: 0;
      font-size: clamp(22px, 2.6vw, 34px);
      line-height: 1.1;
    }
    .badge {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--accent-2);
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
    }
    .controls {
      display: grid;
      grid-template-columns: minmax(260px, 420px) auto auto auto 1fr;
      gap: 12px;
      align-items: center;
    }
    select, button, a.button {
      min-height: 44px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      padding: 0 14px;
      font: inherit;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow);
    }
    select { width: 100%; }
    button:hover, a.button:hover, select:hover {
      border-color: var(--accent);
    }
    button:disabled {
      opacity: .45;
      cursor: not-allowed;
    }
    .current {
      display: flex;
      justify-content: flex-end;
      min-width: 0;
    }
    .current-card {
      min-width: 0;
      max-width: 100%;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 14px;
      box-shadow: var(--shadow);
    }
    .current-title {
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .current-meta {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .viewer {
      padding: 16px;
    }
    .viewer-inner {
      max-width: 1400px;
      margin: 0 auto;
      height: calc(100vh - 170px);
      min-height: 600px;
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
    .empty {
      display: grid;
      place-items: center;
      height: 100%;
      color: #1f2937;
      font-size: 18px;
      padding: 24px;
      text-align: center;
    }
    .hint {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    @media (max-width: 1100px) {
      .controls {
        grid-template-columns: 1fr 1fr 1fr;
      }
      .current {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
      .viewer-inner {
        height: calc(100vh - 250px);
      }
    }
    @media (max-width: 640px) {
      .controls {
        grid-template-columns: 1fr;
      }
      .viewer-inner {
        height: calc(100vh - 340px);
        min-height: 500px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="topbar-inner">
        <div>
          <div class="headline">
            <h1>ES Trading Plans</h1>
          </div>
          <div class="muted">Trading is a game of probabilities — define the risk, honor the stop, and live to trade the next setup.</div>
        </div>

        <div class="controls">
          <select id="planSelect" aria-label="Choose a plan"></select>
          <button id="latestBtn" type="button">Latest</button>
          <button id="olderBtn" type="button">Older</button>
          <a id="openBtn" class="button" href="#" target="_blank" rel="noopener noreferrer">Open in new tab</a>
          <div class="current">
            <div class="current-card">
              <div class="muted">Currently viewing</div>
              <div class="current-title" id="currentTitle">Loading…</div>
              <div class="current-meta" id="currentMeta"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="viewer">
      <div class="viewer-inner" id="viewerInner">
        <iframe id="planFrame" title="Selected trading plan"></iframe>
      </div>
    </div>
  </div>

  <script>
    const plans = ${manifestJson};
    const select = document.getElementById('planSelect');
    const frame = document.getElementById('planFrame');
    const openBtn = document.getElementById('openBtn');
    const currentTitle = document.getElementById('currentTitle');
    const currentMeta = document.getElementById('currentMeta');
    const latestBtn = document.getElementById('latestBtn');
    const olderBtn = document.getElementById('olderBtn');

    if (!plans.length) {
      document.getElementById('viewerInner').innerHTML = '<div class="empty">No plan files were found.<br />Put your HTML files into the <code>plans/</code> folder and rebuild.</div>';
    } else {
      const groupMap = new Map();
      plans.forEach((plan, index) => {
        let group = groupMap.get(plan.dateGroupLabel);
        if (!group) {
          group = document.createElement('optgroup');
          group.label = plan.dateGroupLabel;
          groupMap.set(plan.dateGroupLabel, group);
          select.appendChild(group);
        }

        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = plan.versionLabel;
        option.title = plan.title;
        group.appendChild(option);
      });

      function update(index, replace = false) {
        const plan = plans[index];
        if (!plan) return;
        select.value = String(index);
        frame.src = plan.href;
        openBtn.href = plan.href;
        currentTitle.textContent = plan.dateGroupLabel + ' — ' + plan.versionLabel;
        currentMeta.textContent = plan.title;
        latestBtn.disabled = index === 0;
        olderBtn.disabled = index >= plans.length - 1;

        const url = new URL(window.location.href);
        url.searchParams.set('plan', plan.slug);
        if (replace) {
          history.replaceState({}, '', url);
        } else {
          history.pushState({}, '', url);
        }
      }

      select.addEventListener('change', () => update(Number(select.value)));
      latestBtn.addEventListener('click', () => update(0));
      olderBtn.addEventListener('click', () => {
        const currentIndex = Number(select.value);
        const nextIndex = Math.min(currentIndex + 1, plans.length - 1);
        update(nextIndex);
      });

      const requestedSlug = new URL(window.location.href).searchParams.get('plan');
      const requestedIndex = plans.findIndex(plan => plan.slug === requestedSlug);
      update(requestedIndex >= 0 ? requestedIndex : 0, true);
    }
  </script>
</body>
</html>`;
}

function main() {
  ensureDir(DIST_DIR);
  fs.rmSync(DIST_PLANS_DIR, { recursive: true, force: true });
  ensureDir(DIST_PLANS_DIR);

  if (!fs.existsSync(PLANS_DIR)) {
    throw new Error('Missing plans/ directory');
  }

  const usedSlugs = new Set();
  const seenHashes = new Set();
  const planFiles = fs.readdirSync(PLANS_DIR)
    .filter(name => name.toLowerCase().endsWith('.html'))
    .sort((a, b) => {
      const normalize = value => value.replace(/\s+\(\d+\)(?=\.html$)/i, '');
      const aNorm = normalize(a);
      const bNorm = normalize(b);
      const baseCompare = aNorm.localeCompare(bNorm);
      if (baseCompare !== 0) return baseCompare;
      return a.length - b.length;
    });

  const plans = [];
  for (const name of planFiles) {
    const item = toManifestItem(name, usedSlugs);
    if (seenHashes.has(item.hash)) continue;
    seenHashes.add(item.hash);
    plans.push(item);
  }

  plans.sort((a, b) => {
    const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
    if (dateDiff !== 0) return dateDiff;
    if (a.versionSort !== b.versionSort) return a.versionSort - b.versionSort;
    const uploadDiff = new Date(b.uploadTime) - new Date(a.uploadTime);
    if (uploadDiff !== 0) return uploadDiff;
    return a.title.localeCompare(b.title);
  });

  const publicPlans = plans.map(({ hash, versionSort, ...plan }) => plan);

  fs.writeFileSync(path.join(DIST_DIR, 'plans.json'), JSON.stringify(publicPlans, null, 2));
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildIndexHtml(publicPlans));
  fs.writeFileSync(
    path.join(DIST_DIR, '404.html'),
    '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/"><title>Redirecting…</title><p>Redirecting to <a href="/">home</a>…</p>'
  );

  console.log(`Built ${plans.length} plan pages into dist/`);
}

main();

