// Tampilan: setiap fungsi render* mengembalikan string HTML untuk area utama.
// Interaksi memakai atribut data-act / data-chg / data-inp yang ditangani di main.js.
import { ANGGARAN, INSTANSI, KOP_PO, PAKET } from './instansi.js';
import { SEKOLAH } from './master-data.js';
import { laporanAnggaran, laporanBbbp, laporanPO, laporanRab, notaRentang } from './reports.js';
import {
  analisaTempelan,
  hariAktif,
  namaSheet,
  notaUrut,
  petaBahan,
  petaSupplier,
  rentangBbbp,
  state,
  tanggalAda,
  tanggalRab,
  urutBerikutnya,
} from './store.js';
import { $, akhirBulan, bulanIndo, esc, formatDMY, hariIni, rupiah, tanggalIndo } from './utils.js';

const PESAN_KOSONG = '<p class="m">Belum ada nota. Simpan nota dari tab Input Nota.</p>';

export const totalDraft = (draft) => draft.baris.reduce((t, b) => t + (Number(b.qty) || 0) * (Number(b.harga) || 0), 0);

// Navigasi tanggal ringkas: panah sebelumnya/berikutnya + pilihan bulan + pilihan tanggal.
function navigasiTanggal(aktif, tanggal = tanggalAda(), bukaLain = false) {
  const bulan = [...new Set(tanggal.map((t) => t.slice(0, 7)))];
  const bulanAktif = aktif.slice(0, 7);
  const i = tanggal.indexOf(aktif);
  const opsi = (nilai, teks, terpilih) =>
    `<option value="${nilai}"${nilai === terpilih ? ' selected' : ''}>${teks}</option>`;
  const jumlahNota = notaUrut().filter((n) => n.tanggal === aktif).length;
  return `
    <div class="navtgl noprint">
      <button class="btn g ikon" data-act="geserHari" data-arah="-1" ${i <= 0 ? 'disabled' : ''} title="Tanggal sebelumnya">&#8249;</button>
      <select data-chg="pilihBulan" aria-label="Bulan">${bulan.map((b) => opsi(b, bulanIndo(b), bulanAktif)).join('')}</select>
      <select data-chg="pilihHari" aria-label="Tanggal">${tanggal
        .filter((t) => t.startsWith(bulanAktif))
        .map((t) => opsi(t, tanggalIndo(t), aktif))
        .join('')}</select>
      <button class="btn g ikon" data-act="geserHari" data-arah="1" ${i >= tanggal.length - 1 ? 'disabled' : ''} title="Tanggal berikutnya">&#8250;</button>
      <span class="m">${jumlahNota} nota pada tanggal ini</span>
      ${bukaLain ? '<label class="inline">atau buka tanggal lain <input type="date" data-chg="bukaTanggal"></label>' : ''}
    </div>`;
}

const tombolSheet = (daftar, aktif) =>
  `<div class="tabs">${daftar
    .map(
      ({ id, label }) =>
        `<button class="${id === aktif ? 'on' : ''}" data-act="pilih" data-id="${esc(id)}">${esc(label)}</button>`,
    )
    .join('')}</div>`;
const tombolCetak = (kind, id) =>
  `<button class="btn" data-act="cetak" data-kind="${kind}" data-id="${esc(id)}">Cetak</button>`;
const tombolExcel = (kind, bulan, label = 'Unduh Excel') =>
  `<button class="btn g" data-act="unduh" data-kind="${kind}" data-id="${bulan}">${label}</button>`;

// ---------- Login ----------
export const renderLogin = () => `
  <div class="card" style="max-width:380px;margin:30px auto">
    <h2>Masuk</h2>
    <label>Email<input id="email" type="email" autocomplete="username"></label>
    <label class="mt">Kata sandi<input id="sandi" type="password" autocomplete="current-password"></label>
    <p><button class="btn" data-act="masuk">Masuk</button></p>
  </div>`;

// ---------- Input nota ----------
function barisInput(b, i) {
  return `
    <tr>
      <td><input list="dl-bahan" value="${esc(b.uraian)}" data-chg="bahan" data-i="${i}" placeholder="ketik / pilih bahan"></td>
      <td class="w80"><input type="number" step="any" value="${esc(b.qty)}" data-inp="qty" data-i="${i}"></td>
      <td class="w80"><input value="${esc(b.satuan)}" data-chg="satuan" data-i="${i}"></td>
      <td class="w110"><input type="number" value="${esc(b.harga)}" data-inp="harga" data-i="${i}"></td>
      <td class="r w120" id="jumlah-${i}">${rupiah(b.qty * b.harga)}</td>
      <td class="c"><button class="link-del" data-act="hapusBaris" data-i="${i}" title="Hapus baris">×</button></td>
    </tr>`;
}

export function renderInput() {
  const { draft } = state;
  const sedangEdit = Boolean(draft.editId);
  const notaLama = sedangEdit ? state.nota.find((n) => n.id === draft.editId) : null;
  const opsi = (peta) => [...peta.values()].map((x) => `<option value="${esc(x.nama)}">`).join('');
  const tombolSimpan = sedangEdit
    ? `<button class="btn" data-act="simpan">Simpan perubahan</button><button class="btn g" data-act="batalEdit">Batal</button>`
    : `<button class="btn" data-act="simpan">Simpan sebagai PO_${String(urutBerikutnya(draft.tanggal)).padStart(2, '0')}_${draft.tanggal}</button>`;
  return `
    <datalist id="dl-bahan">${opsi(petaBahan())}</datalist>
    <datalist id="dl-supplier">${opsi(petaSupplier())}</datalist>
    ${sedangEdit ? `<div class="card banner">Sedang mengedit <b>${notaLama ? namaSheet(notaLama) : 'nota'}</b>. Ubah datanya lalu klik "Simpan perubahan".</div>` : ''}
    <div class="card">
      <div class="row">
        <label>Tanggal menu<input type="date" value="${draft.tanggal}" data-chg="tanggal"></label>
        <label>Supplier<input list="dl-supplier" value="${esc(draft.supplier)}" data-inp="supplier" placeholder="pilih / ketik supplier baru"></label>
      </div>
      <div class="row mt">
        <label style="flex:2">Alamat supplier (untuk di PO)<input id="alamat" value="${esc(draft.alamat)}" data-inp="alamat"></label>
        <label>Nomor bukti transaksi (isi manual)<input value="${esc(draft.bukti)}" data-inp="bukti" placeholder="boleh dikosongkan"></label>
      </div>
    </div>
    <div class="card">
      <table>
        <tr><th>Bahan</th><th>Qty</th><th>Satuan</th><th>Harga</th><th>Jumlah</th><th></th></tr>
        ${draft.baris.map(barisInput).join('')}
      </table>
      <p class="r"><b>Total nota: <span id="total-draft">${rupiah(totalDraft(draft))}</span></b></p>
      <div class="row">
        <button class="btn g" data-act="tambahBaris">+ Baris bahan</button>
        ${tombolSimpan}
      </div>
      <p class="m"><small>Harga & satuan terisi dari riwayat; ubah bila hari ini berbeda. Setiap nota menjadi satu sheet PO.</small></p>
    </div>`;
}

// ---------- Nota / PO ----------
export function renderPO() {
  if (!tanggalAda().length) return PESAN_KOSONG;
  const hari = hariAktif();
  const harian = notaUrut().filter((n) => n.tanggal === hari);
  const nota = harian.find((n) => n.id === state.notaId) ?? harian[0];
  const po = laporanPO(nota);
  const { pembuat, mengetahui } = INSTANSI;
  return `
    ${navigasiTanggal(hari)}
    ${tombolSheet(
      harian.map((n) => ({ id: n.id, label: `${namaSheet(n).slice(0, 5)} · ${n.supplier}` })),
      nota.id,
    )}
    <div class="noprint row mt">
      ${tombolCetak('po', nota.id)}${tombolExcel('po', nota.tanggal.slice(0, 7), 'Unduh Excel PO bulan ini')}
      <button class="btn g" data-act="edit" data-id="${esc(nota.id)}">Edit nota ini</button>
      <button class="btn d" data-act="hapusNota" data-id="${esc(nota.id)}">Hapus nota ini</button>
    </div>
    <div class="sheet sheet-po">
      <div class="kop"><b>${KOP_PO[0]}</b><br>${KOP_PO[1]}<br>${KOP_PO[2]}<br><br>
        <b>NOTA PESANAN BAHAN PANGAN</b><br>No. ${po.nomor}</div><br>
      <div class="row info">
        <div style="flex:2">SPPG : ${INSTANSI.sppg}<br>ID SPPG : ${INSTANSI.idSppg}<br>
          Kepada : <b>${esc(po.supplier)}</b><br>Alamat : ${esc(po.alamat)}</div>
        <div>Tgl. Permintaan: ${formatDMY(po.tglKirim)}<br>Tgl. Pengiriman: ${formatDMY(po.tglKirim)}</div>
      </div><br>
      <table>
        <tr><th>NO</th><th>URAIAN BAHAN</th><th>QTY</th><th>SATUAN</th><th>HARGA</th><th>TOTAL</th></tr>
        ${po.baris
          .map(
            (b) => `<tr><td class="c">${b.no}</td><td>${esc(b.uraian)}</td><td class="c">${b.qty}</td>
          <td class="c">${esc(b.satuan)}</td><td class="r">${rupiah(b.harga)}</td><td class="r">${rupiah(b.jumlah)}</td></tr>`,
          )
          .join('')}
        <tr class="tot"><td colspan="5" class="r">Total</td><td class="r">${rupiah(po.total)}</td></tr>
      </table>
      <div class="sig">
        <div>Dibuat Oleh,<br><br><br><b>${pembuat.nama}</b><br>${pembuat.jabatan}</div>
        <div>Diketahui Oleh,<br><br><br><b>${mengetahui.nama}</b><br>${mengetahui.jabatan}</div>
      </div>
    </div>`;
}

// ---------- RAB harian ----------
export function renderRab() {
  const daftar = tanggalRab();
  const aktif = hariAktif(daftar) ?? hariIni(); // bisa tanggal tanpa nota (untuk mengisi jumlah siswa lebih dulu)
  const rab = laporanRab(aktif);
  const baris = (b) => `
    <tr class="hl"><td class="c">${b.no}</td><td>${esc(b.uraian)}</td><td class="c">${b.qty}</td><td class="c">${esc(b.satuan)}</td>
      <td class="r">${rupiah(b.harga)}</td><td class="r">${rupiah(b.jumlah)}</td><td>${esc(b.keterangan)}</td></tr>`;
  const sekolah = (s, i) => `
    <tr><td class="c">${s.no ?? ''}</td><td>${esc(s.nama)}</td><td>${esc(s.klaster)}</td>
      <td class="c w80"><input type="number" min="0" value="${esc(rab.siswa[i] ?? '')}" data-chg="siswa" data-i="${i}" data-tanggal="${aktif}"></td>
      <td class="r">${rupiah(s.pagu)}</td><td class="r" id="jml-${i}">${rupiah((Number(rab.siswa[i]) || 0) * s.pagu)}</td></tr>`;
  return `
    ${navigasiTanggal(aktif, daftar.length ? daftar : [aktif], true)}
    <div class="noprint row mt">
      <label>Menu hari ini<input value="${esc(rab.menu)}" data-chg="menu" data-tanggal="${aktif}"></label>
      <div style="align-self:end">
        ${tombolCetak('rab', aktif)} <button class="btn g" data-act="salinSiswa" data-tanggal="${aktif}">Salin siswa dari hari sebelumnya</button>
        ${tombolExcel('rab', aktif.slice(0, 7), 'Unduh Excel RAB bulan ini')}
      </div>
    </div>
    <div class="sheet mt">
      <b>RENCANA ANGGARAN BELANJA (RAB) BAHAN BAKU HARIAN</b><br>${INSTANSI.sppg}<br>${INSTANSI.yayasan}<br>
      Hari : ${tanggalIndo(aktif)}<br>MENU: ${esc(rab.menu || '-')}<br><br>
      <table>
        <tr><th>NO</th><th>URAIAN</th><th>QTY</th><th>SATUAN</th><th>HARGA</th><th>JUMLAH</th><th>KETERANGAN</th></tr>
        ${rab.baris.map(baris).join('')}
        <tr class="tot"><td colspan="5">TOTAL</td><td class="r">${rupiah(rab.total)}</td><td>${rab.jumlahNota} nota</td></tr>
        <tr class="tot"><td colspan="5">PAGU BELANJA HARIAN</td><td class="r" id="rab-pagu">${rupiah(rab.pagu)}</td><td id="rab-info">${rab.pagu ? '' : 'Isi jumlah siswa di tabel bawah'}</td></tr>
        <tr class="tot"><td colspan="5">SISA</td><td class="r" id="rab-sisa">${rupiah(rab.sisa)}</td><td class="warn" id="rab-status">${rab.pagu && rab.sisa < 0 ? 'MELEBIHI PAGU' : ''}</td></tr>
      </table><br>
      <table>
        <tr><th>NO</th><th>SEKOLAH</th><th>KLASTER</th><th>JUMLAH SISWA</th><th>PAGU HARGA</th><th>JUMLAH</th></tr>
        ${SEKOLAH.map(sekolah).join('')}
        <tr class="tot"><td colspan="3">TOTAL</td><td class="c" id="total-siswa">${hitungSiswa(rab)}</td><td></td><td class="r" id="total-pagu">${rupiah(rab.pagu)}</td></tr>
      </table>
    </div>`;
}

const hitungSiswa = (rab) => rab.siswa.reduce((t, x) => t + (Number(x) || 0), 0);

/** Perbarui angka turunan RAB di layar saat jumlah siswa diketik (tanpa menggambar ulang). */
export function perbaruiRab(tanggal) {
  const rab = laporanRab(tanggal);
  SEKOLAH.forEach((s, i) => {
    $(`#jml-${i}`).textContent = rupiah((Number(rab.siswa[i]) || 0) * s.pagu);
  });
  $('#total-siswa').textContent = hitungSiswa(rab);
  $('#total-pagu').textContent = rupiah(rab.pagu);
  $('#rab-pagu').textContent = rupiah(rab.pagu);
  $('#rab-sisa').textContent = rupiah(rab.sisa);
  $('#rab-info').textContent = rab.pagu ? '' : 'Isi jumlah siswa di tabel bawah';
  $('#rab-status').textContent = rab.pagu && rab.sisa < 0 ? 'MELEBIHI PAGU' : '';
}

// ---------- BBBP (rentang tanggal bebas) ----------
export function renderBbbp() {
  const bulan = [...new Set(notaUrut().map((n) => n.tanggal.slice(0, 7)))];
  if (!bulan.length) return PESAN_KOSONG;
  const { dari, sampai } = rentangBbbp();
  const bbbp = laporanBbbp(dari, sampai);
  const idRentang = `${dari}_${sampai}`;
  const baris = (b) => `
    <tr><td class="c">${b.no}</td><td>${b.tanggal}</td><td>${esc(b.bukti)}</td><td>${esc(b.supplier)}</td><td>${esc(b.uraian)}</td>
      <td class="c">${b.qty}</td><td class="c">${esc(b.satuan)}</td><td class="r">${rupiah(b.harga)}</td>
      <td class="r">${rupiah(b.jumlah)}</td><td class="r"><b>${b.totalHari === '' ? '' : rupiah(b.totalHari)}</b></td></tr>`;
  const pilihBulan = (b) =>
    `<button class="${dari === `${b}-01` && sampai === akhirBulan(b) ? 'on' : ''}" data-act="rentangBulan" data-bulan="${b}">${bulanIndo(b)}</button>`;
  return `
    <div class="tabs">${bulan.map(pilihBulan).join('')}</div>
    <div class="noprint row mt">
      <label>Dari tanggal<input type="date" value="${dari}" data-chg="rentangDari"></label>
      <label>Sampai tanggal<input type="date" value="${sampai}" data-chg="rentangSampai"></label>
      <div style="align-self:end">${tombolCetak('bbbp', idRentang)} ${tombolExcel('bbbp', idRentang, 'Unduh Excel BBBP')}</div>
    </div>
    <div class="sheet mt">
      <div class="kop"><img src="templates/logo.png" alt="" style="float:left;height:64px">
        <b>${INSTANSI.sppg}</b><br>${INSTANSI.alamat}<br><b>BUKU BANTU BAHAN PANGAN</b><br>Periode: ${esc(bbbp.periode)}</div>
      <div style="clear:both"></div><br>
      <table>
        <tr><th>No</th><th>Tanggal</th><th>Nomor Bukti Transaksi</th><th>SUPPLIER</th><th>Uraian</th><th>QTY</th><th>SATUAN</th><th>HARGA SATUAN</th><th>TOTAL</th><th>TOTAL PERHARI</th></tr>
        ${bbbp.baris.map(baris).join('')}
        <tr class="tot"><td colspan="8">TOTAL</td><td class="r">${rupiah(bbbp.total)}</td><td></td></tr>
      </table>
    </div>`;
}

// ---------- Anggaran Bahan Makanan (ringkasan per tanggal, berasal dari RAB Harian) ----------
const akun = (n) => `<div class="akun"><span>Rp</span><span>${Math.round(n).toLocaleString('id-ID')}</span></div>`;

export function renderAnggaran() {
  const bulan = [...new Set(tanggalRab().map((t) => t.slice(0, 7)))];
  const { dari, sampai } = rentangBbbp();
  const lap = laporanAnggaran(dari, sampai);
  const idRentang = `${dari}_${sampai}`;
  const pilihBulan = (b) =>
    `<button class="${dari === `${b}-01` && sampai === akhirBulan(b) ? 'on' : ''}" data-act="rentangBulan" data-bulan="${b}">${bulanIndo(b)}</button>`;
  const paket = (h, k) =>
    `<td>${PAKET[k].nama}</td><td class="kuning c">${h.jumlah[k]}</td><td>${akun(PAKET[k].harga)}</td><td>${akun(h.anggaran[k])}</td>`;
  const baris = (h) => {
    const kosong = h.realisasi === null;
    const kuning = kosong ? ' class="kuning"' : '';
    return `
      <tr>
        <td rowspan="2"><a href="#" class="tgl" data-act="keRab" data-tanggal="${h.tanggal}" title="Buka RAB Harian tanggal ini">${tanggalIndo(h.tanggal)}</a></td>
        ${paket(h, 0)}
        <td rowspan="2">${akun(h.totalAnggaran)}</td>
        <td rowspan="2"${kuning}>${kosong ? '' : akun(h.realisasi)}</td>
        <td rowspan="2"${kuning}>${akun(h.selisih)}</td>
        <td rowspan="2"></td>
      </tr>
      <tr>${paket(h, 1)}</tr>`;
  };
  return `
    <div class="tabs">${bulan.map(pilihBulan).join('')}</div>
    <div class="noprint row mt">
      <label>Dari tanggal<input type="date" value="${dari}" data-chg="rentangDari"></label>
      <label>Sampai tanggal<input type="date" value="${sampai}" data-chg="rentangSampai"></label>
      <div style="align-self:end">${tombolCetak('anggaran', idRentang)} ${tombolExcel('anggaran', idRentang, 'Unduh Excel Anggaran')}</div>
    </div>
    <p class="m noprint"><small>Jumlah paket diambil dari jumlah siswa yang diisi di tab RAB Harian (klik tanggal untuk membukanya). Realisasi = total belanja hari itu; kuning = belum ada nota.</small></p>
    <div class="sheet mt">
      <div class="kop"><img src="templates/logo.png" alt="" style="float:left;height:64px">
        <b style="font-size:17px">${INSTANSI.sppg}</b><br>${ANGGARAN.kop.join('<br>')}<br>
        <b style="color:#3d85c6;font-size:15px">ANGGARAN BAHAN MAKANAN</b><br><b>Periode ${lap.periode}</b></div>
      <div style="clear:both"></div><br>
      <table class="ang">
        <tr><th>HARI/TANGGAL</th><th colspan="2">JUMLAH PAKET MBG</th><th>HARGA PAKET</th><th>ANGGARAN</th><th>TOTAL ANGGARAN</th><th>REALISASI</th><th>SELISIH</th><th>KET</th></tr>
        ${lap.hari.map(baris).join('') || '<tr><td colspan="9" class="c">Belum ada data. Isi jumlah siswa di tab RAB Harian atau simpan nota.</td></tr>'}
        <tr class="sur"><td colspan="5">SURPLUS/HUTANG</td><td>${akun(lap.total.totalAnggaran)}</td><td>${akun(lap.total.realisasi)}</td><td>${akun(lap.total.selisih)}</td><td></td></tr>
        <tr class="ptc"><td colspan="5" class="tanpa"></td><td>${akun(lap.total.totalAnggaran)}</td><td>${akun(lap.total.realisasi)}</td><td>${akun(lap.total.selisih)}</td><td class="tanpa"></td></tr>
      </table>
      <div class="sig"><div style="margin-left:48%">Dibuat Oleh,<br><br><br><br><b><u>${ANGGARAN.pembuat}</u></b><br>${INSTANSI.pembuat.jabatan}</div>
        <div>Diketahui Oleh,<br><br><br><br><b><u>${ANGGARAN.mengetahui}</u></b><br>${INSTANSI.mengetahui.jabatan}</div></div>
    </div>`;
}

// ---------- Ringkasan (beranda): kartu angka + grafik anggaran vs realisasi + hal yang perlu perhatian ----------
function grafikAnggaran(hari) {
  const W = 640;
  const H = 230;
  const kiri = 6;
  const atas = 14;
  const tinggi = H - atas - 26;
  const maks = Math.max(1, ...hari.flatMap((h) => [h.totalAnggaran, h.realisasi ?? 0]));
  const lebarGrup = (W - kiri * 2) / hari.length;
  const bar = Math.min(18, lebarGrup * 0.36);
  const y = (v) => atas + tinggi - (v / maks) * tinggi;
  const dasar = atas + tinggi;
  const garis = [0, 0.5, 1]
    .map(
      (p) =>
        `<line stroke="#e7e4f3" stroke-width="1" x1="${kiri}" x2="${W - kiri}" y1="${atas + tinggi * (1 - p)}" y2="${atas + tinggi * (1 - p)}"/>`,
    )
    .join('');
  const batang = hari
    .map((h, i) => {
      const real = h.realisasi ?? 0;
      const x0 = kiri + i * lebarGrup + (lebarGrup - bar * 2 - 3) / 2;
      const info = `${tanggalIndo(h.tanggal)} - anggaran ${rupiah(h.totalAnggaran)}, realisasi ${h.realisasi === null ? 'belum ada' : rupiah(real)}`;
      return `<g><title>${esc(info)}</title>
        <rect fill="#cfc6ff" x="${x0}" y="${y(h.totalAnggaran)}" width="${bar}" height="${dasar - y(h.totalAnggaran)}" rx="4"/>
        <rect fill="${real > h.totalAnggaran ? '#ff6b57' : '#6c4df6'}" x="${x0 + bar + 3}" y="${y(real)}" width="${bar}" height="${dasar - y(real)}" rx="4"/>
        <text fill="#6f6b8a" font-size="10" font-weight="500" font-family="Poppins, sans-serif" x="${kiri + i * lebarGrup + lebarGrup / 2}" y="${H - 8}" text-anchor="middle">${Number(h.tanggal.slice(8))}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik anggaran dan realisasi per hari">${garis}${batang}</svg>`;
}

export function renderRingkasan() {
  const bulan = [...new Set(tanggalRab().map((t) => t.slice(0, 7)))];
  const { dari, sampai } = rentangBbbp();
  const lap = laporanAnggaran(dari, sampai);
  const jumlahNota = notaRentang(dari, sampai).length;
  const pilihBulan = (b) =>
    `<button class="${dari === `${b}-01` && sampai === akhirBulan(b) ? 'on' : ''}" data-act="rentangBulan" data-bulan="${b}">${bulanIndo(b)}</button>`;

  // hari yang perlu ditindaklanjuti
  const perhatian = lap.hari.flatMap((h) => {
    if (h.realisasi === null) return [{ h, kelas: 'kuning', teks: 'Belum ada nota' }];
    if (h.totalAnggaran === 0) return [{ h, kelas: 'biru', teks: 'Siswa belum diisi' }];
    if (h.selisih < 0) return [{ h, kelas: 'merah', teks: `Lebih ${rupiah(-h.selisih)}` }];
    return [];
  });
  const kartu = (aksen, simbol, judul, nilai, ket) => `
    <div class="card kpi" style="--aksen:var(--${aksen});--aksen-s:var(--${aksen}-s)">
      <span class="ikon">${simbol}</span><p class="judul">${judul}</p><p class="nilai">${nilai}</p><p class="ket">${ket}</p>
    </div>`;
  const surplus = lap.total.selisih >= 0;
  const isi = lap.hari.length
    ? `
    <div class="kpi-grid">
      ${kartu('violet', 'Rp', 'Total anggaran', rupiah(lap.total.totalAnggaran), `${lap.hari.length} hari`)}
      ${kartu('sky', 'Rp', 'Realisasi belanja', rupiah(lap.total.realisasi), `${jumlahNota} nota`)}
      ${kartu(surplus ? 'green' : 'coral', surplus ? '+' : '!', surplus ? 'Sisa anggaran' : 'Melebihi pagu', rupiah(Math.abs(lap.total.selisih)), 'anggaran - realisasi')}
      ${kartu('yellow', String(perhatian.length), 'Perlu perhatian', `${perhatian.length} hari`, perhatian.length ? 'lihat daftar di samping' : 'semua beres')}
    </div>
    <div class="grid2">
      <div class="card">
        <h2>Anggaran vs realisasi per hari</h2>
        <div class="legenda"><span><i class="dot" style="background:#cfc6ff"></i>Anggaran</span><span><i class="dot" style="background:var(--violet)"></i>Realisasi</span><span><i class="dot" style="background:var(--coral)"></i>Melebihi pagu</span></div>
        <div class="grafik">${grafikAnggaran(lap.hari)}</div>
      </div>
      <div class="card">
        <h2>Perlu perhatian</h2>
        ${
          perhatian.length
            ? `<ul class="perhatian">${perhatian
                .map(
                  ({ h, kelas, teks }) =>
                    `<li><a href="#" data-act="keRab" data-tanggal="${h.tanggal}"><span>${tanggalIndo(h.tanggal)}</span><span class="pill ${kelas}">${teks}</span></a></li>`,
                )
                .join('')}</ul>`
            : '<p class="kosong">Semua hari sesuai anggaran.</p>'
        }
      </div>
    </div>`
    : `<div class="card kosong"><h2>Belum ada data pada periode ini</h2>
        <p>Mulai dengan menyimpan nota pertama, lalu isi jumlah siswa di tab RAB Harian.</p></div>`;
  return `
    <div class="row between" style="margin:6px 0 14px">
      <div><h2 class="besar">Ringkasan</h2><p class="m" style="margin:2px 0 0">Periode ${lap.periode}</p></div>
      <button class="btn" data-act="tab" data-tab="input">+ Nota baru</button>
    </div>
    ${bulan.length ? `<div class="tabs">${bulan.map(pilihBulan).join('')}</div>` : ''}
    ${isi}`;
}

// ---------- Tempel dari Excel (mis. sheet B_BahanBaku pada LPDH) ----------
const CATATAN_SUPPLIER = {
  ada: '',
  mirip: '<span class="pill kuning">dicocokkan - periksa</span>',
  baru: '<span class="pill biru">supplier baru</span>',
};

function htmlPratinjau() {
  const { impor } = state;
  if (!impor.teks.trim()) return '';
  const hasil = analisaTempelan();
  if (hasil.galat) return `<div class="card banner">${esc(hasil.galat)}</div>`;
  const baru = hasil.nota.filter((n) => !n.duplikat);
  const suppliers = [...petaSupplier().values()].map((s) => s.nama);
  const totalBaru = baru.reduce((t, n) => t + n.total, 0);
  const jumlahPeringatan = hasil.baris.filter((b) => b.peringatan.length).length;
  const blokNota = (n) => `
    <div class="card nota-impor${n.duplikat ? ' lewat' : ''}">
      <div class="row between">
        <div><b>${tanggalIndo(n.tanggal)}</b>${n.tanggal !== n.tanggalAsli ? ` <span class="m">(di Excel: ${formatDMY(n.tanggalAsli)})</span>` : ''}<br>
          <span class="m">No. bukti: ${esc(n.bukti) || '-'} &middot; ${n.items.length} item &middot; ${rupiah(n.total)}</span></div>
        <div class="row" style="align-items:center">
          ${CATATAN_SUPPLIER[n.statusSupplier]}
          <select data-chg="imporSupplier" data-kunci="${esc(n.kunci)}" aria-label="Supplier">
            ${suppliers.map((s) => `<option value="${esc(s)}"${s === n.supplier ? ' selected' : ''}>${esc(s)}</option>`).join('')}
            ${suppliers.includes(n.supplier) ? '' : `<option value="${esc(n.supplier)}" selected>(baru) ${esc(n.supplier)}</option>`}
          </select>
          <span class="pill ${n.duplikat ? 'kuning' : 'hijau'}">${n.duplikat ? 'Sudah ada - dilewati' : 'Baru'}</span>
        </div>
      </div>
      <table class="mini">
        <tr><th>Bahan</th><th>Kategori</th><th class="r">Volume</th><th>Satuan</th><th class="r">Harga</th><th class="r">Jumlah</th></tr>
        ${n.items
          .map(
            (i) => `<tr${i.peringatan.length ? ` class="peringatan" title="${esc(i.peringatan.join('; '))}"` : ''}>
              <td>${esc(i.uraian)}</td><td>${esc(i.kategori)}</td><td class="r">${i.qty}</td><td>${esc(i.satuan)}</td>
              <td class="r">${rupiah(i.harga)}</td><td class="r">${rupiah(i.qty * i.harga)}</td></tr>`,
          )
          .join('')}
      </table>
    </div>`;
  return `
    <div class="card">
      <div class="row between">
        <div><b>${hasil.baris.length} baris dibaca</b> &rarr; ${hasil.nota.length} nota (${baru.length} baru${
          hasil.nota.length > baru.length ? `, ${hasil.nota.length - baru.length} sudah ada` : ''
        }) &middot; total baru <b>${rupiah(totalBaru)}</b>
          <br><span class="m">${hasil.dilewati ? `${hasil.dilewati} baris kosong/ringkasan dilewati. ` : ''}${
            jumlahPeringatan
              ? `${jumlahPeringatan} baris: jumlah di Excel tidak sama dengan volume x harga (ditandai kuning).`
              : ''
          }</span></div>
        <button class="btn" data-act="simpanImpor" ${hasil.bermasalah.length || !baru.length ? 'disabled' : ''}>Simpan ${baru.length} nota</button>
      </div>
      ${
        hasil.bermasalah.length
          ? `<ul class="masalah">${hasil.bermasalah
              .map(
                (b) =>
                  `<li>Baris ${b.no}: ${esc(b.uraian || '(tanpa nama)')} &mdash; ${esc(b.masalah.join(', '))}</li>`,
              )
              .join('')}</ul><p class="warn">Perbaiki baris di atas di Excel, lalu tempel ulang.</p>`
          : ''
      }
    </div>
    ${hasil.nota.map(blokNota).join('')}`;
}

/** Perbarui hanya bagian pratinjau (tanpa menggambar ulang kotak tempel agar kursor tidak hilang). */
export function perbaruiPratinjau() {
  $('#pratinjau').innerHTML = htmlPratinjau();
}

export function renderImpor() {
  const { impor } = state;
  return `
    <div class="card">
      <h2>Tempel dari Excel</h2>
      <ol class="langkah">
        <li>Di Excel (sheet <b>B_BahanBaku</b>), blok baris yang mau dipindah, dari kolom <b>Tanggal Transaksi</b> sampai <b>No. Bukti/Nota</b> (boleh dengan baris judul), lalu tekan <kbd>Ctrl</kbd>+<kbd>C</kbd>.</li>
        <li>Klik kotak di bawah, lalu tekan <kbd>Ctrl</kbd>+<kbd>V</kbd>.</li>
        <li>Periksa pratinjau, lalu klik <b>Simpan</b>. Baris dengan nomor nota yang sama (<code>INV/26/0036-1</code>, <code>-2</code>, ...) digabung menjadi satu nota per pemasok.</li>
      </ol>
      <textarea id="tempel" data-inp="tempel" rows="7" placeholder="Tempel data dari Excel di sini...">${esc(impor.teks)}</textarea>
      <div class="row mt" style="align-items:flex-end">
        <label style="max-width:300px">Tanggal nota di web = tanggal di Excel + (hari)
          <input type="number" id="geser" value="${impor.geser}" data-inp="geser"></label>
        <p class="m" style="flex:1;min-width:220px;margin:0"><small>Isi 0 bila tanggal transaksi di Excel sama dengan tanggal menu di web. Isi 1 bila belanja dilakukan sehari sebelum tanggal menu.</small></p>
      </div>
    </div>
    <div id="pratinjau">${htmlPratinjau()}</div>`;
}
