// Membaca data yang disalin dari Excel (mis. sheet B_BahanBaku pada LPDH) lalu mengelompokkannya menjadi nota.
// Modul ini murni (tidak menyentuh layar atau database) sehingga mudah diuji.

const BULAN = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  pebruari: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  nop: 11,
  desember: 12,
  des: 12,
  dec: 12,
};

const p2 = (n) => String(n).padStart(2, '0');
const tahunPenuh = (y) => (y < 100 ? 2000 + y : y);

function iso(y, m, d) {
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? `${y}-${p2(m)}-${p2(d)}` : null;
}

/** Membaca tanggal dari teks Excel: 27-10-2026, 27/10/2026, 2026-10-27, 27 Oktober 2026, 27-Oct-26, atau nomor seri Excel. */
export function bacaTanggal(teks) {
  const t = String(teks ?? '').trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(t);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    // bawaan: hari/bulan/tahun (Indonesia); bila bulan > 12 padahal hari <= 12, berarti bulan/hari/tahun
    return b > 12 && a <= 12 ? iso(tahunPenuh(+m[3]), a, b) : iso(tahunPenuh(+m[3]), b, a);
  }
  m = /^(?:[A-Za-z]+,?\s+)?(\d{1,2})[\s-]+([A-Za-z]+)[\s,-]+(\d{2,4})/.exec(t);
  if (m && BULAN[m[2].toLowerCase()]) return iso(tahunPenuh(+m[3]), BULAN[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000); // nomor seri Excel
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

/** Membaca angka dari teks Excel: 15750, 15.750, 15,750, Rp 15.750, 2,5, 2.5. Kosong/"-" menghasilkan null. */
export function bacaAngka(teks) {
  let t = String(teks ?? '')
    .replace(/rp/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!t || t === '-') return null;
  const koma = t.lastIndexOf(',');
  const titik = t.lastIndexOf('.');
  if (koma >= 0 && titik >= 0) {
    t = koma > titik ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''); // pemisah desimal = yang terakhir
  } else if (koma >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (titik >= 0 && /^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // 15.750 = ribuan
  }
  const angka = Number(t);
  return Number.isFinite(angka) ? angka : null;
}

// ---------- membaca kolom ----------
const URUTAN_BAWAAN = ['tanggal', 'bahan', 'kategori', 'qty', 'satuan', 'harga', 'jumlah', 'pemasok', 'bukti', 'link'];
const JUDUL = [
  ['link', /link/],
  ['pemasok', /pemasok|supplier/],
  ['bukti', /bukti|nota/],
  ['kategori', /kategori/],
  ['bahan', /nama bahan|uraian/],
  ['tanggal', /tanggal/],
  ['harga', /harga/],
  ['jumlah', /^jumlah/],
  ['qty', /volume|qty/],
  ['satuan', /^satuan$/],
];

function petakanJudul(sel) {
  const peta = {};
  sel.forEach((teks, i) => {
    const t = teks.toLowerCase().trim();
    if (!t || /^(status|kode|keterangan|no$)/.test(t)) return;
    const kunci = JUDUL.find(([, re]) => re.test(t))?.[0];
    if (kunci && !(kunci in peta)) peta[kunci] = i;
  });
  return peta;
}

/**
 * Membaca teks hasil salin dari Excel (dipisah tab). Boleh dengan atau tanpa baris judul, dan boleh mulai dari kolom
 * "No" atau langsung dari "Tanggal Transaksi". Baris kosong / baris ringkasan dilewati.
 */
export function bacaTempelan(teks) {
  const garis = String(teks ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.split('\t').map((c) => c.trim().replace(/^"(.*)"$/s, '$1')))
    .filter((b) => b.some((c) => c !== ''));
  if (!garis.length) return { baris: [], dilewati: 0, galat: '' };

  let peta = petakanJudul(garis[0]);
  let awal = 0;
  if (peta.tanggal !== undefined && peta.bahan !== undefined) awal = 1;
  else {
    const idx = garis.map((b) => b.findIndex((c) => bacaTanggal(c))).find((i) => i >= 0);
    if (idx === undefined) {
      return {
        baris: [],
        dilewati: 0,
        galat: 'Kolom tanggal tidak ditemukan. Salin mulai dari kolom "Tanggal Transaksi".',
      };
    }
    peta = Object.fromEntries(URUTAN_BAWAAN.map((k, i) => [k, idx + i]));
  }

  const baris = [];
  let dilewati = 0;
  garis.slice(awal).forEach((b, n) => {
    const ambil = (k) => (peta[k] === undefined ? '' : (b[peta[k]] ?? ''));
    const tanggal = bacaTanggal(ambil('tanggal'));
    const uraian = ambil('bahan');
    if (!tanggal && !uraian) {
      dilewati += 1; // baris kosong atau ringkasan
      return;
    }
    const qty = bacaAngka(ambil('qty'));
    const harga = bacaAngka(ambil('harga'));
    const jumlah = bacaAngka(ambil('jumlah'));
    const masalah = [];
    const peringatan = [];
    if (!tanggal) masalah.push('tanggal tidak terbaca');
    if (!uraian) masalah.push('nama bahan kosong');
    if (!(qty > 0)) masalah.push('volume kosong/0');
    if (!(harga > 0)) masalah.push('harga kosong/0');
    if (!ambil('pemasok')) masalah.push('nama pemasok kosong');
    if (jumlah !== null && qty > 0 && harga > 0 && Math.abs(jumlah - qty * harga) > 1) {
      peringatan.push(`Jumlah di Excel (${jumlah}) tidak sama dengan volume x harga (${qty * harga})`);
    }
    baris.push({
      no: awal + n + 1,
      tanggal,
      uraian,
      kategori: ambil('kategori'),
      qty,
      satuan: ambil('satuan'),
      harga,
      jumlah,
      pemasok: ambil('pemasok'),
      bukti: ambil('bukti'),
      masalah,
      peringatan,
    });
  });
  return { baris, dilewati, galat: '' };
}

// ---------- mencocokkan nama pemasok ----------
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function jarak(a, b) {
  const baris = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) baris[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      baris[i][j] = Math.min(
        baris[i - 1][j] + 1,
        baris[i][j - 1] + 1,
        baris[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return baris[a.length][b.length];
}

/** Mencari pemasok yang sama / mirip di daftar supplier. status: 'ada' | 'mirip' | 'baru'. */
export function cocokkanSupplier(nama, daftar) {
  const n = norm(nama);
  const sama = daftar.find((s) => norm(s) === n);
  if (sama) return { nama: sama, status: 'ada' };
  const mirip = daftar
    .map((s) => ({ s, d: jarak(n, norm(s)) }))
    .filter((x) => n.length >= 4 && x.d <= 2)
    .sort((a, b) => a.d - b.d)[0];
  return mirip ? { nama: mirip.s, status: 'mirip' } : { nama, status: 'baru' };
}

// ---------- mengelompokkan menjadi nota ----------
const pecahBukti = (b) => {
  const m = /^(.*?)[-/](\d{1,3})$/.exec(b);
  return m ? { dasar: m[1], urutan: Number(m[2]) } : { dasar: b, urutan: null };
};

const geserTanggal = (tanggal, hari) => {
  if (!hari) return tanggal;
  const t = new Date(`${tanggal}T00:00:00`);
  t.setDate(t.getDate() + hari);
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
};

/**
 * Baris pada LPDH = satu item; satu nota ditulis dengan akhiran urutan (INV/26/0036-1, -2, ...).
 * Baris dengan tanggal + pemasok + nomor nota dasar yang sama digabung menjadi satu nota.
 */
export function kelompokkanNota(baris, { notaAda = [], daftarSupplier = [], geserHari = 0, gantiSupplier = {} } = {}) {
  const sah = baris.filter((b) => !b.masalah.length);
  const awal = new Map();
  sah.forEach((b) => {
    const p = b.bukti ? pecahBukti(b.bukti) : { dasar: '', urutan: null };
    const kunci = [b.tanggal, norm(b.pemasok), p.dasar].join('|');
    if (!awal.has(kunci)) awal.set(kunci, []);
    awal.get(kunci).push({ b, urutan: p.urutan });
  });

  const kelompok = new Map(); // kunci -> { bukti, baris }
  awal.forEach((daftar, kunci) => {
    const berurutan = daftar.every((x, i) => x.urutan === i + 1); // akhiran 1,2,3,... = item dalam satu nota
    if (berurutan || !daftar[0].b.bukti) {
      kelompok.set(kunci, {
        bukti: daftar[0].b.bukti ? pecahBukti(daftar[0].b.bukti).dasar : '',
        baris: daftar.map((x) => x.b),
      });
    } else {
      daftar.forEach(({ b }) => {
        const k = [b.tanggal, norm(b.pemasok), b.bukti].join('|');
        if (!kelompok.has(k)) kelompok.set(k, { bukti: b.bukti, baris: [] });
        kelompok.get(k).baris.push(b);
      });
    }
  });

  return [...kelompok.entries()].map(([kunci, { bukti, baris: isi }]) => {
    const pemasokAsli = isi[0].pemasok;
    const cocok = cocokkanSupplier(pemasokAsli, daftarSupplier);
    const supplier = gantiSupplier[kunci] ?? cocok.nama;
    const items = isi.map((b) => ({
      uraian: b.uraian,
      kategori: b.kategori,
      qty: b.qty,
      satuan: b.satuan,
      harga: b.harga,
      no: b.no,
      peringatan: b.peringatan,
    }));
    const total = items.reduce((t, i) => t + i.qty * i.harga, 0);
    const tanggal = geserTanggal(isi[0].tanggal, geserHari);
    const duplikat = notaAda.some(
      (n) =>
        n.tanggal === tanggal &&
        norm(n.supplier) === norm(supplier) &&
        (bukti ? (n.bukti ?? '') === bukti : n.items.reduce((t, i) => t + i.qty * i.harga, 0) === total),
    );
    const statusSupplier = gantiSupplier[kunci] ? (daftarSupplier.includes(supplier) ? 'ada' : 'baru') : cocok.status;
    return {
      kunci,
      tanggalAsli: isi[0].tanggal,
      tanggal,
      pemasokAsli,
      supplier,
      statusSupplier,
      bukti,
      items,
      total,
      duplikat,
    };
  });
}

/** Satu langkah: baca teks, kelompokkan, dan kembalikan ringkasan untuk pratinjau. */
export function analisa(teks, opsi) {
  const baca = bacaTempelan(teks);
  const nota = kelompokkanNota(baca.baris, opsi);
  return { ...baca, nota, bermasalah: baca.baris.filter((b) => b.masalah.length) };
}
