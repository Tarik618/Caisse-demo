// Base de données locale : IndexedDB (fichier stocké dans le navigateur de la tablette).
// Aucune connexion Internet n'est nécessaire.
const DB_NAME = 'patisserie-caisse';
const VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
      const sales = d.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
      sales.createIndex('ts', 'ts');
      d.createObjectStore('shifts', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function store(name, mode = 'readonly') {
  const d = await open();
  return d.transaction(name, mode).objectStore(name);
}

export const db = {
  async all(name) { return wrap((await store(name)).getAll()); },
  async get(name, key) { return wrap((await store(name)).get(key)); },
  async put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); },
  async del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); },
  async count(name) { return wrap((await store(name)).count()); },
  async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },

  // Ventes entre deux dates (timestamps en millisecondes)
  async range(name, index, lo, hi) {
    const s = await store(name);
    return wrap(s.index(index).getAll(IDBKeyRange.bound(lo, hi)));
  },

  // Enregistre une vente ET baisse le stock dans UNE SEULE transaction :
  // soit tout réussit, soit rien n'est modifié (comme BEGIN / COMMIT en SQL).
  async completeSale(sale) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(['sales', 'products'], 'readwrite');
      const products = tx.objectStore('products');
      const sales = tx.objectStore('sales');
      let pending = sale.items.length;
      let failed = false;
      const fail = (err) => { if (failed) return; failed = true; try { tx.abort(); } catch (e) { /* déjà annulée */ } reject(err); };

      sale.items.forEach((it) => {
        const g = products.get(it.pid);
        g.onsuccess = () => {
          const p = g.result;
          if (!p) return fail(new Error('PRODUCT_MISSING:' + it.name));
          if (p.stock < it.qty) return fail(new Error('STOCK:' + p.name + ':' + p.stock));
          p.stock -= it.qty;
          products.put(p);
          if (--pending === 0 && !failed) {
            const add = sales.add(sale);
            add.onsuccess = () => resolve(add.result);
          }
        };
        g.onerror = () => fail(g.error);
      });
      tx.onerror = () => fail(tx.error);
    });
  },

  // Annule une vente : la vente est marquée « annulée » et le stock est remis.
  async voidSale(id, who) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(['sales', 'products'], 'readwrite');
      const sales = tx.objectStore('sales');
      const products = tx.objectStore('products');
      const g = sales.get(id);
      g.onsuccess = () => {
        const sale = g.result;
        if (!sale || sale.voided) { tx.abort(); return reject(new Error('ALREADY_VOID')); }
        sale.voided = true; sale.voidedAt = Date.now(); sale.voidedBy = who;
        sales.put(sale);
        sale.items.forEach((it) => {
          const pg = products.get(it.pid);
          pg.onsuccess = () => { if (pg.result) { pg.result.stock += it.qty; products.put(pg.result); } };
        });
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('ABORT'));
    });
  },

  async productUsed(pid) {
    const all = await this.all('sales');
    return all.some((s) => s.items.some((i) => i.pid === pid));
  },

  async exportAll() {
    const out = {};
    for (const n of ['products', 'users', 'sales', 'shifts', 'settings']) out[n] = await this.all(n);
    return { app: 'patisserie-caisse', version: 1, exportedAt: new Date().toISOString(), data: out };
  },

  async importAll(payload) {
    if (!payload || payload.app !== 'patisserie-caisse' || !payload.data) throw new Error('BAD_FILE');
    for (const n of ['products', 'users', 'sales', 'shifts', 'settings']) {
      await this.clear(n);
      for (const row of payload.data[n] || []) await this.put(n, row);
    }
  },
};
