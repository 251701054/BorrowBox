#!/usr/bin/env node
'use strict';
// BorrowBox: retrieve distinct candidate photos for the 50 equipment records.
// Node.js 18+ only. No npm install, Python, SQL, or backend changes required.
// Run from this package's root: node download_equipment_photos.js
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const FRONTEND = path.join(ROOT, 'frontend');
const IMAGE_DIR = path.join(FRONTEND, 'images', 'equipment');
const PLAN_PATH = path.join(ROOT, 'equipment-photo-plan.json');
const MAP_PATH = path.join(FRONTEND, 'equipment-photos.js');
const CREDITS_PATH = path.join(FRONTEND, 'equipment-image-credits.json');
const REVIEW_PATH = path.join(FRONTEND, 'equipment-photo-review.csv');
const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'BorrowBoxEducationalInventory/1.0 (college project; Wikimedia Commons photo attribution)';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const BAD_TERMS = /\b(logo|icon|diagram|drawing|schematic|symbol|advert|illustration|datasheet|screenshot|clipart|manual|cover|poster)\b/i;
const IGNORE_WORDS = new Set(['kit','for','the','and','with','digital','portable','external','usb','wireless','camera','computer','device','stand','adapter','module']);
const dryRun = process.argv.includes('--dry-run');

function textOnly(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokens(value) {
  return [...new Set((String(value).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(word => word.length > 2 && !IGNORE_WORDS.has(word)))];
}
function rank(photo, item) {
  const title = photo.title.toLowerCase().replace(/[_-]/g, ' ');
  if (BAD_TERMS.test(title)) return -100;
  const nameWords = tokens(item.name);
  const descriptionWords = tokens(item.description);
  const queryWords = tokens(item.search_query);
  const nameMatches = nameWords.filter(word => title.includes(word)).length;
  const queryMatches = queryWords.filter(word => title.includes(word)).length;
  const descriptionMatches = descriptionWords.filter(word => title.includes(word)).length;
  // Require a meaningful match in the file title, rather than an arbitrary photo.
  if (!nameMatches && !queryMatches) return -100;
  return nameMatches * 8 + queryMatches * 3 + descriptionMatches * 2;
}
async function request(url, type = 'json') {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: type === 'json' ? 'application/json' : 'image/*' },
    signal: AbortSignal.timeout(25000), redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.url}`);
  if (type === 'json') return response.json();
  const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[mime];
  if (!ext) throw new Error(`Not a supported photo (${mime || 'unknown MIME'})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 2500 || buffer.length > 8_000_000) throw new Error('Image size outside accepted range');
  return { buffer, ext };
}
async function searchCommons(query) {
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '30', prop: 'imageinfo',
    iiprop: 'url|extmetadata', iiurlwidth: '640',
    format: 'json', formatversion: '2'
  });
  const data = await request(`${API}?${params.toString()}`);
  if (data.error) throw new Error(data.error.info || 'Wikimedia API error');
  return (data.query?.pages || []).flatMap(page => {
    const info = page.imageinfo?.[0];
    if (!info?.url) return [];
    const url = info.thumburl || info.url;
    if (!IMAGE_EXTENSIONS.some(ext => new URL(url).pathname.toLowerCase().endsWith(ext))) return [];
    const meta = info.extmetadata || {};
    return [{
      title: page.title || '', url,
      page: info.descriptionurl || '',
      license: textOnly(meta.LicenseShortName?.value),
      licenseUrl: meta.LicenseUrl?.value || '',
      author: textOnly(meta.Artist?.value).slice(0, 200)
    }];
  });
}
function csvEscape(value) {
  const s = String(value ?? '');
  return /[,\r\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function existingImage(equipmentId) {
  const id = String(equipmentId).padStart(2, '0');
  for (const ext of IMAGE_EXTENSIONS) {
    const filename = `${id}${ext}`;
    try {
      const stat = await fs.stat(path.join(IMAGE_DIR, filename));
      if (stat.size > 0) return `images/equipment/${filename}`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return '';
}
async function writeResults(mapping, credits, plan) {
  const ordered = Object.fromEntries(Object.entries(mapping).sort((a, b) => Number(a[0]) - Number(b[0])));
  await fs.writeFile(MAP_PATH,
    '// One distinct image per equipment_id. Generated by download_equipment_photos.js.\n' +
    'window.BORROWBOX_EQUIPMENT_PHOTOS = ' + JSON.stringify(ordered, null, 2) + ';\n', 'utf8');
  await fs.writeFile(CREDITS_PATH, JSON.stringify(credits, null, 2) + '\n', 'utf8');
  const rows = [['equipment_id', 'name', 'description', 'status', 'image_path', 'source_page', 'license', 'author']];
  for (const item of plan) {
    const credit = credits.find(c => Number(c.equipment_id) === Number(item.equipment_id)) || {};
    rows.push([item.equipment_id, item.name, item.description,
      mapping[item.equipment_id] ? 'REVIEW IMAGE' : 'MISSING',
      mapping[item.equipment_id] || '', credit.page || '', credit.license || '', credit.author || '']);
  }
  await fs.writeFile(REVIEW_PATH, rows.map(row => row.map(csvEscape).join(',')).join('\n') + '\n', 'utf8');
}
async function main() {
  const plan = JSON.parse(await fs.readFile(PLAN_PATH, 'utf8'));
  if (!Array.isArray(plan) || !plan.length) throw new Error('Equipment plan is empty or invalid.');
  const ids = new Set(plan.map(item => Number(item.equipment_id)));
  if (ids.size !== plan.length || plan.some(item => !item.name || !item.search_query)) {
    throw new Error('Every equipment entry needs a unique equipment_id, name, and search_query.');
  }
  console.log(`BorrowBox: ${plan.length} inventory items`);
  if (dryRun) {
    plan.forEach(item => console.log(`${item.equipment_id}. ${item.name}: ${item.search_query}`));
    console.log('Dry run complete. No files changed.');
    return;
  }
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  let credits = [];
  try { credits = JSON.parse(await fs.readFile(CREDITS_PATH, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!Array.isArray(credits)) credits = [];
  const usedPages = new Set(credits.map(credit => credit.page).filter(Boolean));
  const usedHashes = new Set();
  const mapping = {};
  for (const item of plan) {
    const id = Number(item.equipment_id);
    console.log(`[${String(id).padStart(2, '0')}/${plan.length}] ${item.name}`);
    const found = await existingImage(id);
    if (found) { mapping[id] = found; console.log(`  Existing image preserved: ${found}`); continue; }
    try {
      // Search with the item's detailed query first, then its name if needed.
      let photos = await searchCommons(item.search_query);
      if (!photos.length) photos = await searchCommons(item.name);
      photos.sort((a, b) => rank(b, item) - rank(a, item));
      let success = false;
      for (const photo of photos) {
        if (rank(photo, item) <= 0 || usedPages.has(photo.page)) continue;
        try {
          const { buffer, ext } = await request(photo.url, 'image');
          const digest = crypto.createHash('sha256').update(buffer).digest('hex');
          if (usedHashes.has(digest)) continue;
          const filename = `${String(id).padStart(2, '0')}${ext}`;
          await fs.writeFile(path.join(IMAGE_DIR, filename), buffer);
          mapping[id] = `images/equipment/${filename}`;
          credits.push({ equipment_id: id, name: item.name, description: item.description, ...photo });
          usedPages.add(photo.page); usedHashes.add(digest);
          console.log(`  Candidate saved: ${filename} (${photo.license || 'license needs checking'})`);
          success = true;
          break;
        } catch (error) { console.log(`  Candidate skipped: ${error.message}`); }
      }
      if (!success) console.log('  No suitable candidate found. Add a photograph manually.');
    } catch (error) { console.log(`  Search failed: ${error.message}`); }
    // Save progress after each item; safe to rerun if interrupted.
    await writeResults(mapping, credits, plan);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  await writeResults(mapping, credits, plan);
  console.log(`\nFinished: ${Object.keys(mapping).length}/${plan.length} images present.`);
  console.log(`Check: ${REVIEW_PATH}`);
  console.log('Review ALL images and their licenses before publishing.');
  console.log('If you replace an incorrect image, keep its 2-digit filename and extension.');
}
main().catch(error => { console.error('Failed:', error.message); process.exitCode = 1; });
