// State aplikasi, akses database Supabase, dan fungsi pencarian data.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { analisa } from './impor.js';
import { INSTANSI } from './instansi.js';
import { BAHAN, SUPPLIER } from './master-data.js';
import { akhirBulan, hariIni, maks, pad, ROMAWI } from './utils.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const barisKosong = () => ({ uraian: '', qty: '', satuan: '', harga: '' });
export const draftBaru = (tanggal = hariIni()) => ({
  tanggal,
  supplier: '',
  alamat: '',
  bukti: '', // nomor bukti transaksi, diisi manual
  editId: null, // terisi bila sedang mengedit nota
  baris: [barisKosong()],
});

export const state = {
  user: null,
  tab: 'ringkasan', // ringkasan | input | po | rab | anggaran | bbbp | login
  hari: null, // tanggal yang sedang dibuka di tab Nota / PO dan RAB (null = tanggal terakhir)
  notaId: null, // nota yang sedang dibuka pada tanggal itu (null = nota pertama)
  rentang: null, // rentang tanggal BBBP { dari, sampai }; null = bulan terakhir yang ada datanya
  nota: [],
  rab: {}, // { 'YYYY-MM-DD': { menu, pagu } }
  extra: { bahan: [], supplier: [] }, // master tambahan dari database
  draft: draftBaru(),
  impor: { teks: '', geser: 0, ganti: {} }, // fitur Tempel dari Excel: teks tempelan, geser tanggal, pilihan supplier manual
};

/** Rentang tanggal BBBP yang sedang dipilih (bawaan: seluruh bulan terakhir yang ada datanya). */
export function rentangBbbp() {
  if (state.rentang) return state.rentang;
  const tanggal = state.nota.map((n) => n.tanggal).sort();
  if (!tanggal.length) return { dari: hariIni(), sampai: hariIni() };
  const bulan = tanggal.at(-1).slice(0, 7);
  return { dari: `${bulan}-01`, sampai: akhirBulan(bulan) };
}

// ---------- pencarian & perhitungan ----------
const gabung = (awal, tambahan) => {
  const peta = new Map(awal.map((x) => [x.nama.toLowerCase(), x]));
  tambahan.forEach((x) => peta.set(x.nama.toLowerCase(), x)); // data database menimpa data awal
  return peta;
};
export const petaBahan = () => gabung(BAHAN, state.extra.bahan);
export const petaSupplier = () => gabung(SUPPLIER, state.extra.supplier);

export const notaUrut = () => [...state.nota].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.urut - b.urut);
export const totalNota = (n) => n.items.reduce((t, i) => t + i.qty * i.harga, 0);
/** Tanggal-tanggal yang punya nota (urut naik). */
export const tanggalAda = () => [...new Set(notaUrut().map((n) => n.tanggal))];

/** Tanggal yang punya data RAB: ada nota, atau jumlah siswa sudah diisi, atau sedang dibuka di layar. */
export const tanggalRab = () =>
  [
    ...new Set([
      ...tanggalAda(),
      ...Object.keys(state.rab).filter((t) => state.rab[t].siswa?.some((x) => Number(x) > 0)),
      ...(state.hari ? [state.hari] : []),
    ]),
  ].sort();

/** Tanggal yang sedang dibuka (bawaan: tanggal terakhir pada daftar). Untuk tab PO daftar = tanggalAda(), untuk RAB = tanggalRab(). */
export function hariAktif(daftar = tanggalAda()) {
  return daftar.includes(state.hari) ? state.hari : daftar.at(-1);
}

export const namaSheet = (n) => `PO_${pad(n.urut)}_${n.tanggal}`;
export const urutBerikutnya = (tanggal) =>
  maks(
    state.nota.filter((n) => n.tanggal === tanggal),
    'urut',
  ) + 1;

export const nomorPO = (n) =>
  `${pad(n.no_po, 3)}/${INSTANSI.kodePO}/${ROMAWI[Number(n.tanggal.slice(5, 7)) - 1]}/${n.tanggal.slice(0, 4)}`;

// ---------- autentikasi ----------
export const masuk = (email, password) => sb.auth.signInWithPassword({ email, password });
export const keluar = () => sb.auth.signOut();

// Nomor urut nota per hari (PO_01, PO_02, ...) dan nomor PO per bulan dihitung dari urutan nota yang ada,
// sehingga bila satu nota dihapus, nota berikutnya otomatis naik menggantikan nomornya.
export function nomorkanNota(daftar) {
  const urutan = [...daftar].sort(
    (a, b) =>
      a.tanggal.localeCompare(b.tanggal) ||
      a.urut - b.urut ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
  );
  const perHari = {};
  const perBulan = {};
  return urutan.map((n) => {
    const bulan = n.tanggal.slice(0, 7);
    perHari[n.tanggal] = (perHari[n.tanggal] ?? 0) + 1;
    perBulan[bulan] = (perBulan[bulan] ?? 0) + 1;
    return { ...n, urutAsli: n.urut, urut: perHari[n.tanggal], no_po: perBulan[bulan], bukti: n.bukti ?? '' };
  });
}

// ---------- database ----------
export async function muatData() {
  const [nota, rab, master] = await Promise.all([
    sb.from('nota').select('*').order('tanggal').order('urut'),
    sb.from('rab').select('*'),
    sb.from('master_extra').select('*').eq('id', 'main').maybeSingle(),
  ]);
  if (nota.error) throw nota.error;
  state.nota = nomorkanNota(nota.data);
  state.rab = Object.fromEntries((rab.data ?? []).map((r) => [r.tanggal, r]));
  state.extra = { bahan: master.data?.bahan ?? [], supplier: master.data?.supplier ?? [] };
}

const PESAN_NOTA = 'Isi supplier dan minimal satu bahan lengkap (qty & harga).';

const bersihkanItems = (baris) =>
  baris
    .filter((b) => b.uraian && Number(b.qty) > 0 && Number(b.harga) > 0)
    .map((b) => ({
      uraian: b.uraian.trim(),
      qty: Number(b.qty),
      satuan: b.satuan,
      harga: Number(b.harga),
      ...(b.kategori ? { kategori: b.kategori } : {}),
    }));

/** Menyusun baris nota baru untuk database. `kerja` = nota yang sudah ada (termasuk yang baru ditambahkan dalam satu batch). */
function susunNotaBaru(draft, kerja, akhiranId = '') {
  const items = bersihkanItems(draft.baris);
  if (!draft.supplier.trim() || !items.length) throw new Error(PESAN_NOTA);
  const bulan = draft.tanggal.slice(0, 7);
  return {
    id: `${draft.tanggal}_${Date.now().toString(36)}${akhiranId}`, // id unik, tidak ikut berubah saat nomor ditata ulang
    tanggal: draft.tanggal,
    supplier: draft.supplier.trim(),
    alamat: draft.alamat ?? '',
    bukti: (draft.bukti ?? '').trim(),
    items,
    urut:
      maks(
        kerja.filter((n) => n.tanggal === draft.tanggal),
        'urutAsli',
      ) + 1,
    no_po:
      maks(
        kerja.filter((n) => n.tanggal.startsWith(bulan)),
        'no_po',
      ) + 1,
  };
}

export async function simpanNota(draft) {
  let id = draft.editId;
  let data;
  if (id) {
    // mode edit: perbarui nota yang ada
    const items = bersihkanItems(draft.baris);
    if (!draft.supplier.trim() || !items.length) throw new Error(PESAN_NOTA);
    data = {
      tanggal: draft.tanggal,
      supplier: draft.supplier.trim(),
      alamat: draft.alamat,
      bukti: draft.bukti.trim(),
      items,
    };
    const lama = state.nota.find((n) => n.id === id);
    if (lama && lama.tanggal !== draft.tanggal) {
      const hariBaru = state.nota.filter((n) => n.tanggal === draft.tanggal && n.id !== id);
      data.urut = maks(hariBaru, 'urutAsli') + 1; // pindah hari -> nota terakhir hari itu
    }
    const { error } = await sb.from('nota').update(data).eq('id', id);
    if (error) throw error;
  } else {
    data = susunNotaBaru(draft, state.nota);
    id = data.id;
    const { error } = await sb.from('nota').insert(data);
    if (error) throw error;
  }
  await simpanMasterBaru([data]);
  await muatData();
  return id;
}

/** Menyimpan banyak nota sekaligus (fitur Tempel dari Excel): satu kali simpan dan satu kali muat ulang. */
export async function simpanNotaMassal(daftarDraft) {
  const kerja = [...state.nota];
  const baru = daftarDraft.map((draft, i) => {
    const nota = susunNotaBaru(draft, kerja, i);
    kerja.push({ ...nota, urutAsli: nota.urut });
    return nota;
  });
  const { error } = await sb.from('nota').insert(baru);
  if (error) throw error;
  await simpanMasterBaru(baru);
  await muatData();
  return baru.length;
}

/** Muat nota ke formulir input untuk diedit. */
export function mulaiEdit(id) {
  const nota = state.nota.find((n) => n.id === id);
  if (!nota) return;
  state.draft = {
    tanggal: nota.tanggal,
    supplier: nota.supplier,
    alamat: nota.alamat ?? '',
    bukti: nota.bukti ?? '',
    editId: nota.id,
    baris: nota.items.map((i) => ({ uraian: i.uraian, qty: i.qty, satuan: i.satuan, harga: i.harga })),
  };
}

// Bahan & supplier yang dipakai di nota diingat (harga terakhir jadi harga standar berikutnya).
async function simpanMasterBaru(daftarNota) {
  const bahan = gabung([], state.extra.bahan);
  const supplier = gabung([], state.extra.supplier);
  const dikenal = petaSupplier();
  daftarNota.forEach((nota) => {
    nota.items.forEach((i) =>
      bahan.set(i.uraian.toLowerCase(), {
        nama: i.uraian,
        satuan: i.satuan,
        harga: i.harga,
        ...(i.kategori ? { kategori: i.kategori } : {}),
      }),
    );
    const kunci = nota.supplier.toLowerCase();
    if (nota.alamat || !dikenal.has(kunci)) supplier.set(kunci, { nama: nota.supplier, alamat: nota.alamat ?? '' });
  });
  await sb.from('master_extra').upsert({ id: 'main', bahan: [...bahan.values()], supplier: [...supplier.values()] });
}

export async function hapusNota(id) {
  const { error } = await sb.from('nota').delete().eq('id', id);
  if (error) throw error;
  await muatData();
}

export async function simpanRab(tanggal, perubahan) {
  const data = { ...(state.rab[tanggal] ?? {}), tanggal, ...perubahan };
  const { error } = await sb.from('rab').upsert(data);
  if (error) throw error;
  state.rab[tanggal] = data;
}

/** Membaca tempelan Excel yang sedang ada di layar dan mengelompokkannya menjadi nota (untuk pratinjau dan simpan). */
export const analisaTempelan = () =>
  analisa(state.impor.teks, {
    notaAda: state.nota,
    daftarSupplier: [...petaSupplier().values()].map((s) => s.nama),
    geserHari: state.impor.geser,
    gantiSupplier: state.impor.ganti,
  });
