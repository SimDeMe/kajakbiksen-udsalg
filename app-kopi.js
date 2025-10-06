// 1) Sæt dit publicerede CSV-link her
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1I7y9md-xs0FrEKrAppuyw7te8wuahaSPDgewH-2xxxI/export?format=csv&gid=1702983393';

// 2) Grundindstillinger
const IMAGE_BASE = 'img'; // billederne ligger i /img/{ID}.jpg
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-size="16">Intet billede</text></svg>`
);

// 3) Hjælpefunktioner
function dkk(n) {
  if (n == null || isNaN(n)) return '';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 2 }).format(n);
}
function toNumber(v) {
  if (v == null) return 0;
  const s = String(v).trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function normalizeRow(r) {
  if (!r['ID']) {
    console.log("Row uden ID:", r);
    return null;
  }
  const id = String(r['ID'] || '').trim();
  const navn = (r['Navn'] || '').trim();
  const kategori = (r['Kategori'] || '').trim().replace(/\.$/, '');
  const basis = toNumber(r['Basispris']);      // ex moms
  const priceNow = toNumber(r['Pris i alt']);  // inkl moms
  const antal = toNumber(r['Antal']);

  const vistRaw = (r['Vist'] ?? '').toString().trim();
  const vist = (vistRaw === '' ? 1 : toNumber(vistRaw)) === 1;

  const normalPris = basis > 0 ? basis * 1.25 : priceNow;
  const erTilbud = priceNow > 0 && normalPris > 0 && priceNow < (normalPris - 0.49);

  const kortRaw = (r['Kort beskrivelse'] ?? '').toString();
  const langRaw = (r['Beskrivelse'] ?? '').toString();

  const descHtml = sanitizeHtml(langRaw || kortRaw);   // BRUG lang først
  const kort = sanitizeHtml(kortRaw);                  // stadig rart at have kort

  return { id, navn, kategori, basis, priceNow, normalPris, erTilbud, antal, vist, descHtml, kort };
}

function sanitizeHtml(input) {
  if (!input) return '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = input;

  const allowed = new Set(['P','BR','UL','OL','LI','STRONG','EM','A']);
  const walk = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) { // element
        if (!allowed.has(child.tagName)) {
          const text = document.createTextNode(child.textContent || '');
          node.replaceChild(text, child);
        } else {
          if (child.tagName === 'A') {
            [...child.attributes].forEach(attr => {
              if (attr.name.toLowerCase().startsWith('on')) child.removeAttribute(attr.name);
            });
            const href = child.getAttribute('href') || '';
            if (!/^(https?:|mailto:|tel:)/i.test(href)) child.removeAttribute('href');
            child.setAttribute('rel','noopener noreferrer');
            child.setAttribute('target','_blank');
          } else {
            [...child.attributes].forEach(attr => child.removeAttribute(attr.name));
          }
          walk(child);
        }
      }
    }
  };
  walk(wrapper);
  return wrapper.innerHTML.trim();
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'da'));
}

// 4) Render
function render(products) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  const cardTpl = document.getElementById('card');

  for (const p of products) {
    const node = cardTpl.content.cloneNode(true);
    const img = node.querySelector('.thumb');
    const h2 = node.querySelector('.title');
    const cat = node.querySelector('.cat');
    const desc = node.querySelector('.desc');
    const before = node.querySelector('.before');
    const now = node.querySelector('.now');
    const stock = node.querySelector('.stock');

    const imgUrl = `${IMAGE_BASE}/${p.id}.jpg`;
    img.src = imgUrl;
    img.alt = p.navn || 'Produktbillede';
    img.onerror = () => { img.src = PLACEHOLDER; };

    h2.textContent = p.navn || `#${p.id}`;
    cat.textContent = p.kategori || '';
    desc.innerHTML = p.descHtml || '';

    if (p.erTilbud) {
      before.textContent = dkk(p.normalPris);
      before.classList.remove('hidden');
    } else {
      before.classList.add('hidden');
    }
    now.textContent = dkk(p.priceNow || p.normalPris);

    stock.textContent = p.antal > 0 ? `På lager: ${p.antal}` : `Udsolgt`;

    grid.appendChild(node);
  }
}

// 5) Filtre og sortering
function applyFilters(data) {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const cat = document.getElementById('category').value;
  const sort = document.getElementById('sort').value;

  let items = data.filter(p => p && p.vist && p.antal > 0);

  if (q) {
    items = items.filter(p =>
      (p.navn && p.navn.toLowerCase().includes(q)) ||
      (p.kategori && p.kategori.toLowerCase().includes(q)) ||
      (p.id && p.id.toLowerCase().includes(q))
    );
  }
  if (cat) items = items.filter(p => p.kategori === cat);

  if (sort === 'navn-asc') items.sort((a,b)=> (a.navn||'').localeCompare((b.navn||''),'da'));
  if (sort === 'pris-asc') items.sort((a,b)=> (a.priceNow||a.normalPris) - (b.priceNow||b.normalPris));
  if (sort === 'pris-desc') items.sort((a,b)=> (b.priceNow||b.normalPris) - (a.priceNow||a.normalPris));

  render(items);
}

function populateCategories(data) {
  const sel = document.getElementById('category');
  sel.innerHTML = '<option value="">Alle kategorier</option>'; // reset + tilføj "Alle"

  // Tag kun kategorier med mindst ét produkt, der er vist og på lager
  const cats = uniqueSorted(
    data
      .filter(p => p.vist && p.antal > 0)
      .map(p => p.kategori)
  );

  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
}

// 6) Init
async function init() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Kunne ikke hente CSV fra Google Sheets.');
    const csvText = await res.text();
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const data = rows.map(normalizeRow).filter(Boolean); // <- filtrér null fra
        populateCategories(data);
        document.getElementById('search').addEventListener('input', () => applyFilters(data));
        document.getElementById('category').addEventListener('change', () => applyFilters(data));
        document.getElementById('sort').addEventListener('change', () => applyFilters(data));
        applyFilters(data);
      }
    });
  } catch (e) {
    const grid = document.getElementById('grid');
    grid.innerHTML = `<p>Kunne ikke hente data. Tjek at arket er publiceret som CSV og at SHEET_CSV_URL er korrekt.</p>`;
    console.error(e);
  }
}
document.addEventListener('DOMContentLoaded', init);