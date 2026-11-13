import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import './blueprint.css'

type Variant = 'growth' | 'learn' | 'studio'
type DemoKey = Variant
type DemoDecision = 'approve' | 'revise' | null

const orchestratorHowItWorks: Record<Variant, Array<{ role: string; label: string; detail: string }>> = {
  growth: [
    { role: 'PGAsk', label: 'Kebutuhan', detail: 'budget & kondisi' },
    { role: 'PGRiset', label: 'Riset pasar', detail: '3 marketplace' },
    { role: 'Owner + client', label: 'Cek & pilih', detail: 'stok dan harga' },
    { role: 'PGQuo', label: 'Dokumen', detail: 'quotation / invoice' },
  ],
  learn: [
    { role: 'PLScan', label: 'Asesmen', detail: 'tujuan & level' },
    { role: 'PLBuild', label: 'Cocokkan kelas', detail: 'materi tersedia' },
    { role: 'PLNote', label: 'Sepakati jadwal', detail: 'waktu & biaya' },
    { role: 'Owner + peserta', label: 'Konfirmasi', detail: 'appointment kelas' },
  ],
  studio: [
    { role: 'PSdraft', label: 'Rancang ide', detail: 'niche & caption' },
    { role: 'PSSync', label: 'Atur kalender', detail: 'kanal aktif' },
    { role: 'PSRev', label: 'Review konten', detail: 'audio, video, konteks' },
    { role: 'Owner OK', label: 'Jadwalkan', detail: 'post + ringkasan' },
  ],
}

const orchestratorDemos = {
  growth: {
    name: 'PioGrowth',
    prompt: 'Saya butuh laptop untuk coding dan kerja kantor, budget maksimal Rp7 juta. Saya terbuka untuk unit bekas yang kondisinya baik.',
    priority: 'Priority Gate 01 · kebutuhan pembelian pelanggan',
    steps: [
      { agent: 'PGAsk', label: 'Gali kebutuhan', output: 'Ringkas tujuan pemakaian, budget, pilihan baru/bekas, dan waktu dibutuhkan. Tanyakan detail yang masih kurang.', proof: 'Hasil: profil kebutuhan' },
      { agent: 'PGRiset', label: 'Bandingkan listing', output: 'Cari listing dengan harga di Shopee, Tokopedia, dan TikTok Shop; tampilkan spesifikasi, kondisi, tautan, dan tanggal cek.', proof: 'Demo: tidak menarik harga live' },
      { agent: 'PioCheck + Owner', label: 'Audit dan pastikan', output: 'Cek sumber dan hitung ulang harga. Owner memeriksa spesifikasi serta stok fisik; client memilih unit.', proof: 'Stok belum valid sebelum owner cek' },
      { agent: 'PGQuo', label: 'Siapkan penawaran', output: 'Buat quotation/invoice PioSales setelah client memilih serta owner menyetujui harga dan ketersediaan.', proof: 'Hasil: dokumen menunggu persetujuan' },
    ],
    gate: 'Owner memvalidasi unit ready dan harga aktual; client mengunci pilihan. Sesudah dua pihak setuju, PGQuo menyiapkan dokumen.',
    approve: 'Simulasi setuju: alur boleh diteruskan ke PGQuo setelah stok dan harga dikonfirmasi. Demo ini tidak menyimpan invoice.',
    revise: 'Simulasi revisi: kembalikan ke PGAsk atau PGRiset sesuai catatan owner; listing belum dianggap stok tersedia.',
  },
  learn: {
    name: 'PioLearn',
    prompt: 'Saya ingin belajar AI untuk membantu promosi usaha. Saya masih pemula dan punya waktu belajar sekitar 2 jam per minggu.',
    priority: 'Priority Gate 02 · janji dan jadwal kelas',
    steps: [
      { agent: 'PLScan', label: 'Pahami tujuan', output: 'Tanyakan hasil yang ingin dicapai dan pengalaman. Kuis singkat memetakan pemahaman AI awal.', proof: 'Hasil: profil dan level belajar' },
      { agent: 'PLBuild', label: 'Cocokkan materi', output: 'Bandingkan kebutuhan dengan katalog AI Knowledge. Tunjukkan alasan rekomendasi dan tandai materi yang belum tersedia.', proof: 'Harga/kuota perlu data owner' },
      { agent: 'PLNote', label: 'Cocokkan jadwal', output: 'Cari waktu yang cocok untuk owner dan peserta; ajukan jadwal dan harga dari informasi yang sudah disetujui.', proof: 'Belum membuat appointment' },
      { agent: 'Owner + peserta', label: 'Konfirmasi kelas', output: 'Owner mengesahkan materi, harga, kuota, dan waktu. Peserta menyetujui jadwal sebelum appointment dibuat.', proof: 'Hasil: kelas siap dijadwalkan' },
    ],
    gate: 'Jadwal dan harga tidak dikunci otomatis. Owner memastikan kelas, harga, serta kuota; peserta juga mengonfirmasi waktu.',
    approve: 'Simulasi setuju: setelah owner dan peserta mengonfirmasi kelas, PLNote dapat meneruskan pembuatan appointment. Demo ini tidak mengubah kalender.',
    revise: 'Simulasi revisi: PLBuild memperbaiki rekomendasi atau PLNote mencari jadwal lain; belum ada booking yang dibuat.',
  },
  studio: {
    name: 'PioStudio',
    prompt: 'Siapkan ide konten TikTok 30 detik tentang service laptop untuk pemilik usaha kecil.',
    priority: 'Priority Gate 03 · konten dan promosi tervalidasi',
    steps: [
      { agent: 'PSdraft', label: 'Rancang konsep', output: 'Buat brief, hook, caption, dan hashtag untuk niche IT Maintenance tanpa membuat atau menyimpan video.', proof: 'Hasil: konsep dan draf' },
      { agent: 'PSSync', label: 'Susun kalender', output: 'Pilih kanal dan usulkan jadwal dengan batas maksimal 3 konten/minggu serta buffer 20%.', proof: 'Demo: jadwal belum dipasang' },
      { agent: 'PSRev', label: 'Periksa kualitas', output: 'Tinjau naskah, voice, musik, konteks visual, klaim, glitch, dan kesiapan halaman tujuan.', proof: 'Hasil: catatan revisi / lolos' },
      { agent: 'Owner OK', label: 'Setujui publikasi', output: 'Owner menyetujui versi final. Setelah benar-benar tayang, simpan ringkasan topik, kanal, tanggal, tautan, dan status.', proof: 'Media tetap di kanal sumber' },
    ],
    gate: 'Tidak ada jadwal atau publikasi sebelum owner menyetujui versi final. Arsip pasca-tayang hanya berisi metadata, bukan file media.',
    approve: 'Simulasi setuju: konten dinyatakan siap untuk dijadwalkan setelah kanal terhubung. Demo ini tidak menjadwalkan atau memposting konten.',
    revise: 'Simulasi revisi: PSRev mengembalikan catatan ke PSdraft atau PSSync; publikasi tetap tertahan sampai versi baru disetujui.',
  },
} as const

function HowItWorks({ variant, steps }: { variant: Variant; steps: Array<{ role: string; label: string; detail: string }> }) {
  return (
    <figure className={'bp-how-works ' + variant} aria-label={'Alur ringkas ' + variant}>
      <figcaption><strong>How it works</strong><span>Alur kerja sampai hasil</span></figcaption>
      <div className="bp-how-flow">
        {steps.map(({ role, label, detail }, index) => (
          <div className="bp-how-step-wrap" key={role}>
            <div className="bp-how-step">
              <small>{role}</small>
              <strong>{label}</strong>
              <em>{detail}</em>
            </div>
            {index < steps.length - 1 && <span className="bp-how-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
    </figure>
  )
}

function OrchestratorDemo() {
  const [activeDemo, setActiveDemo] = useState<DemoKey>('growth')
  const [decision, setDecision] = useState<DemoDecision>(null)
  const demo = orchestratorDemos[activeDemo]

  const selectDemo = (key: DemoKey) => {
    setActiveDemo(key)
    setDecision(null)
  }

  return (
    <div className="bp-demo-lab" aria-labelledby="bpDemoTitle">
      <div className="bp-demo-heading">
        <div>
          <span className="bp-section-label">Simulasi estafet · demo interaktif</span>
          <h3 id="bpDemoTitle">Lihat permintaan diproses oleh tiap orchestrator</h3>
        </div>
        <span className="bp-demo-simulation-badge">Simulasi · tanpa aksi produksi</span>
      </div>
      <p className="bp-demo-intro">Pilih jalur untuk melihat contoh input, hasil tiap agen, dan titik persetujuan owner.</p>
      <div className="bp-demo-tabs" role="group" aria-label="Pilih demo orchestrator">
        {(['growth', 'learn', 'studio'] as const).map((key) => (
          <button
            className={'bp-demo-tab ' + key + (activeDemo === key ? ' active' : '')}
            type="button"
            key={key}
            aria-pressed={activeDemo === key}
            onClick={() => selectDemo(key)}
          >
            {key === 'growth' ? 'Demo PioGrowth' : key === 'learn' ? 'Demo PioLearn' : 'Demo PioStudio'}
          </button>
        ))}
      </div>
      <div className={'bp-demo-view ' + activeDemo}>
        <div className="bp-demo-prompt">
          <small>Contoh input · {demo.name}</small>
          <p>“{demo.prompt}”</p>
        </div>
        <div className="bp-demo-route">
          <strong>PioBot</strong><span>{demo.priority}</span><b>→ {demo.name}</b>
        </div>
        <ol className="bp-demo-sequence">
          {demo.steps.map((step, index) => (
            <li key={step.agent}>
              <span className="bp-demo-step-no">0{index + 1}</span>
              <small>{step.agent}</small>
              <strong>{step.label}</strong>
              <p>{step.output}</p>
              <em>{step.proof}</em>
            </li>
          ))}
        </ol>
        <div className="bp-demo-owner-gate">
          <div><small>Gerbang PioCheck + owner</small><p>{demo.gate}</p></div>
          <div className="bp-demo-actions">
            <button type="button" className="approve" onClick={() => setDecision('approve')}>Simulasi: SETUJU</button>
            <button type="button" className="revise" onClick={() => setDecision('revise')}>Simulasi: MINTA REVISI</button>
          </div>
        </div>
        {decision && (
          <p className={'bp-demo-decision ' + decision} role="status" aria-live="polite">
            {decision === 'approve' ? demo.approve : demo.revise}
          </p>
        )}
        <p className="bp-demo-disclaimer">Contoh ini tidak mengambil harga live, menyimpan invoice, membuat appointment, atau menerbitkan konten.</p>
      </div>
    </div>
  )
}

function BlueprintPage() {
  return (
    <div className="bp-page">
      <header className="bp-hero">
        <div className="bp-hero-copy">
          <p className="bp-kicker">PioAssist · Blueprint operasional</p>
          <h1 id="blueprintTitle">Satu PioBot.<br />Tiga orchestrator spesialis.</h1>
          <span className="bp-business-identity">Tim Operasional Digital untuk Bisnis IT Satu Orang</span>
          <p>PioBot mengurutkan kebutuhan yang menghasilkan uang hari ini, menjaga tenggat, dan menyiapkan pekerjaan untuk disetujui owner.</p>
          <aside className="bp-pilot-note">
            <strong>Fokus pilot pertama</strong>
            <span>PioGrowth: permintaan pembeli gadget sampai quotation/invoice, dengan owner memeriksa harga dan stok.</span>
          </aside>
        </div>
        <div className="bp-signature" aria-label="Tiga orchestrator spesialis">
          <span><strong>PioGrowth</strong><small>Gadget · harga · invoice</small></span>
          <span><strong>PioLearn</strong><small>Asesmen · kelas · jadwal</small></span>
          <span><strong>PioStudio</strong><small>Ide · kalender · review</small></span>
        </div>
      </header>

      <section className="bp-section" aria-labelledby="bpProblemTitle">
        <div className="bp-section-head">
          <div><span className="bp-section-label">Masalah yang ditangani</span><h2 id="bpProblemTitle">Pekerjaan reaktif mengambil ruang untuk bertumbuh</h2></div>
          <p>PioAssist menangani beban bisnis satu orang sekaligus keterbatasan agen yang belum punya spesialisasi dan memori berkelanjutan.</p>
        </div>
        <div className="bp-problem-grid">
          <article className="bp-problem-card business">
            <span className="bp-problem-mark">Masalah bisnis · ITPIO</span>
            <h3>Operasional satu orang, banyak kanal</h3>
            <ul>
              <li>Jual-beli dan service laptop, produk digital, serta kelas AI/Meta Ads berjalan bersama tiga marketplace.</li>
              <li>Chat marketplace dan service yang reaktif menggeser promosi; waktu marketing sekitar <strong>15 jam/minggu</strong> dengan budget <strong>Rp500.000/bulan</strong>.</li>
              <li>Kelas AI Basic dan halaman <code>itpio.id/digital/ai-knowledge</code> belum lengkap untuk dipromosikan: harga, jadwal, dan kuota belum ditetapkan.</li>
              <li>Instagram <code>@itpio.id</code> ditangguhkan sejak <strong>11 Oktober 2026</strong>, sehingga kanal promosi perlu menyesuaikan.</li>
            </ul>
          </article>
          <article className="bp-problem-card system">
            <span className="bp-problem-mark">Masalah sistem · agen lama</span>
            <h3>Dua penyakit yang perlu diatasi</h3>
            <div className="bp-disease"><strong>Palugada</strong><p>Satu agen meriset, menganalisis, menulis, sekaligus memvalidasi. Prompt membesar, fokus pecah, dan kualitas turun.</p></div>
            <div className="bp-disease"><strong>Amnesia</strong><p>Saat sesi ditutup, profil, aturan prioritas, dan konteks pengguna tidak terbawa; sesi baru mulai dari nol.</p></div>
          </article>
        </div>
      </section>

      <section className="bp-section bp-priority-section" aria-labelledby="bpPriorityTitle">
        <div className="bp-priority-title">
          <span className="bp-section-label">Aturan uang dulu</span>
          <strong id="bpPriorityTitle">Priority Gate</strong>
          <span>Urutkan kerja sebelum mendelegasikan.</span>
        </div>
        <ol className="bp-priority-list">
          <li>Uang masuk dan kebutuhan pelanggan hari ini</li>
          <li>Janji, tenggat kelas, dan jadwal</li>
          <li>Konten, promosi, dan fakta untuk validasi owner</li>
          <li>Tugas internal yang masih bisa menunggu</li>
        </ol>
      </section>

      <section className="bp-section" aria-labelledby="bpMapTitle">
        <div className="bp-section-head">
          <div><span className="bp-section-label">Tim dan pola kerja</span><h2 id="bpMapTitle">Supervisor memilih jalur; spesialis bekerja berurutan</h2></div>
          <p>Single agent tidak dipakai karena tiap jalur memiliki tools dan retensi memori berbeda. Prompt tetap sempit dari PGAsk sampai PSRev; PioCheck terpisah untuk mengaudit angka dan jadwal sebelum owner menyetujui hasil.</p>
        </div>
        <div className="bp-routing" aria-label="Permintaan masuk ke PioBot, diteruskan ke tiga orchestrator, lalu diperiksa dan disetujui Owner ITPIO">
          <article className="bp-route-hub"><small>Supervisor · membaca niat dan prioritas</small><strong>PioBot</strong><p>Mengumpulkan konteks, memilih satu orchestrator, dan menahan aksi final sampai ada persetujuan.</p></article>
          <div className="bp-branch-line" aria-hidden="true" />
          <div className="bp-route-grid">
            <article className="bp-route-card market"><small>Jalur penjualan gadget</small><strong>PioGrowth</strong><p>HP, tablet, dan laptop · riset harga · quotation dan invoice.</p></article>
            <article className="bp-route-card learn"><small>Jalur pembelajaran</small><strong>PioLearn</strong><p>Tujuan belajar AI · rekomendasi kelas · jadwal dan biaya.</p></article>
            <article className="bp-route-card studio"><small>Jalur promosi ITPIO</small><strong>PioStudio</strong><p>Konten gadget, kelas AI, atau layanan IT Maintenance.</p></article>
          </div>
        </div>
        <div className="bp-checkrail" aria-label="Pemeriksaan bersama sebelum tindakan">
          <article className="bp-check-card quality">
            <small>Quality gate</small><strong>PioCheck</strong>
            <p>Periksa sumber, angka, tanggal, jadwal, dan kesesuaian hasil dengan permintaan.</p>
            <ul className="bp-rule-list"><li>Maksimal 3 konten per minggu</li><li>Sediakan buffer waktu 20%</li><li>Blok service siang maksimal 2 jam</li><li>Cek kelengkapan halaman AI Knowledge sebelum promosi kelas</li></ul>
          </article>
          <article className="bp-check-card approval"><small>Human in the loop</small><strong>Owner ITPIO</strong><p>Validasi ketersediaan, harga, materi, jadwal, atau konten; setujui atau minta revisi.</p></article>
          <article className="bp-check-card execution"><small>Eksekusi</small><strong>Hanya setelah disetujui</strong><p>Terbitkan dokumen, buat appointment, atau jadwalkan konten sesuai izin.</p></article>
        </div>
      </section>

      <section className="bp-section" aria-labelledby="bpAgentsTitle">
        <div className="bp-section-head">
          <div><span className="bp-section-label">Anggota tim dan alur bersama</span><h2 id="bpAgentsTitle">Tiga orchestrator, masing-masing tiga agen</h2></div>
          <p>Setiap tahap menghasilkan bahan untuk agen berikutnya. Pemeriksaan owner di bawah tiap alur adalah gerbang wajib, bukan keputusan otomatis dari AI.</p>
        </div>

        <div className="bp-orchestrators">
          <article className="bp-orchestrator-card market" aria-labelledby="bpMarketTitle">
            <header className="bp-orchestrator-head">
              <div><span className="bp-section-label">Orchestrator 01 · jual beli gadget</span><h3 id="bpMarketTitle">PioGrowth</h3><p>Membantu calon pembeli memilih HP, tablet, atau laptop sesuai kebutuhan dan budget.</p></div>
              <span className="bp-orchestrator-tag">Shopee · Tokopedia · TikTok Shop · PioSales</span>
            </header>
            <HowItWorks variant="growth" steps={orchestratorHowItWorks.growth} />
            <ol className="bp-agent-flow" aria-label="PioGrowth: gali kebutuhan, riset listing, buat quotation dan invoice">
              <li className="bp-stage"><span className="bp-stage-number">01</span><h4>PGAsk · Konsultan kebutuhan</h4><p>Tanyakan kategori gadget, kegunaan, budget, jangka waktu pemakaian, pilihan baru atau bekas, dan preferensi penting.</p><small>Hasil · ringkasan kebutuhan</small></li>
              <li className="bp-stage"><span className="bp-stage-number">02</span><h4>PGRiset · Riset dan opsi</h4><p>Cari listing berharga di Shopee, Tokopedia, dan TikTok Shop. Rangkum harga, spek, kondisi, tautan sumber, dan tanggal cek; listing tidak membuktikan stok.</p><small>Berlaku 14 hari · wajib cek ulang</small></li>
              <li className="bp-stage"><span className="bp-stage-number">03</span><h4>PGQuo · Quotation dan invoice</h4><p>Siapkan quotation untuk unit yang dipilih. Terbitkan invoice setelah pilihan, harga, data pelanggan, dan transaksi dikonfirmasi.</p><small>Tujuan · PioSales</small></li>
            </ol>
            <aside className="bp-gate-note"><strong>Gerbang owner &amp; client</strong><span>Owner memeriksa model, spesifikasi, harga aktual, dan memastikan gadget ready sebelum client memilih. Setelah client memfixkan pilihan dan owner menyetujui detail akhir, Agen 3 menerbitkan quotation/invoice.</span></aside>
          </article>

          <article className="bp-orchestrator-card teach" aria-labelledby="bpTeachTitle">
            <header className="bp-orchestrator-head">
              <div><span className="bp-section-label">Orchestrator 02 · pembelajaran AI</span><h3 id="bpTeachTitle">PioLearn</h3><p>Mencocokkan tujuan dan pemahaman peserta dengan kelas yang tersedia.</p></div>
              <span className="bp-orchestrator-tag">Katalog · asesmen · kalender</span>
            </header>
            <HowItWorks variant="learn" steps={orchestratorHowItWorks.learn} />
            <ol className="bp-agent-flow" aria-label="PioLearn: asesmen kebutuhan, rekomendasi kelas, cocokkan jadwal dan biaya">
              <li className="bp-stage"><span className="bp-stage-number">01</span><h4>PLScan · Kebutuhan dan asesmen</h4><p>Tanyakan tujuan belajar dan pengalaman. Berikan kuis singkat untuk memetakan pemahaman dasar AI, lalu rangkum tingkat awal peserta.</p><small>Hasil · profil belajar</small></li>
              <li className="bp-stage"><span className="bp-stage-number">02</span><h4>PLBuild · Kurasi kelas</h4><p>Cocokkan kebutuhan dengan materi yang tersedia dan jelaskan alasan rekomendasi kelasnya.</p><small>Sumber · <a href="https://www.itpio.id/digital/ai-knowledge" target="_blank" rel="noopener">AI Knowledge ITPIO</a></small></li>
              <li className="bp-stage"><span className="bp-stage-number">03</span><h4>PLNote · Jadwal dan biaya</h4><p>Cocokkan waktu owner dan peserta; usulkan jadwal dan harga berdasarkan daftar kelas yang disetujui.</p><small>Tujuan · appointment sampai sesi akhir</small></li>
            </ol>
            <aside className="bp-gate-note"><strong>Persetujuan owner &amp; peserta</strong><span>Owner menyetujui harga dan jadwal. Appointment dibuat setelah peserta dan owner sama-sama mengonfirmasi waktu serta kelas.</span></aside>
          </article>

          <article className="bp-orchestrator-card content" aria-labelledby="bpContentTitle">
            <header className="bp-orchestrator-head">
              <div><span className="bp-section-label">Orchestrator 03 · promosi itpio.id</span><h3 id="bpContentTitle">PioStudio</h3><p>Menyiapkan konten promosi yang sesuai niche dan menjaga kualitas sebelum tayang.</p></div>
              <span className="bp-orchestrator-tag">TikTok · YouTube Shorts · WA/Telegram</span>
            </header>
            <HowItWorks variant="studio" steps={orchestratorHowItWorks.studio} />
            <ol className="bp-agent-flow" aria-label="PioStudio: rencana ide konten, kalender platform, periksa konten dan minta persetujuan owner">
              <li className="bp-stage"><span className="bp-stage-number">01</span><h4>PSdraft · Strategi konten</h4><p>Rencanakan ide, caption, dan hashtag sesuai niche: gadget, kelas AI, atau layanan IT Maintenance.</p><small>Hasil · brief dan draf konten</small></li>
              <li className="bp-stage"><span className="bp-stage-number">02</span><h4>PSSync · Kalender publikasi</h4><p>Atur jadwal TikTok dan YouTube Shorts; siapkan draf broadcast WA/Telegram. Instagram @itpio.id ditangguhkan sejak 11 Oktober 2026.</p><small>Hasil · rencana jadwal dan draf kanal aktif</small></li>
              <li className="bp-stage"><span className="bp-stage-number">03</span><h4>PSRev · Pemeriksa kualitas</h4><p>Cek ucapan/voice, musik, isi video, konteks visual, dan glitch. Sampaikan temuan lalu minta persetujuan owner.</p><small>Aksi · schedule setelah owner OK</small></li>
            </ol>
            <aside className="bp-gate-note"><strong>Gerbang publikasi</strong><span>Tidak ada konten yang dijadwalkan atau diterbitkan sebelum owner menyetujui versi final. Koneksi akun sosial diperlukan untuk penjadwalan otomatis.</span></aside>
          </article>
        </div>

        <OrchestratorDemo />
      </section>

      <section className="bp-section" aria-labelledby="bpDestinationsTitle">
        <div className="bp-section-head"><div><span className="bp-section-label">Tempat kerja dan hasil</span><h2 id="bpDestinationsTitle">Tugas internal terpisah dari akses member</h2></div><p>ClickUp mengatur pekerjaan tim. Member hanya melihat materi kelas yang sudah disetujui dan diterbitkan.</p></div>
        <div className="bp-destinations">
          <article className="bp-destination"><strong>ClickUp + Drive</strong><p>Task pembuatan materi, penanggung jawab, tenggat, review, serta file draft dan aset kerja.</p></article>
          <article className="bp-destination"><strong>Dashboard member itpio.id</strong><p>Materi dan file kelas yang telah disetujui untuk peserta, bukan ruang kerja draft internal.</p></article>
          <article className="bp-destination"><strong>PioSales · Calendar · kanal sosial</strong><p>Quotation/invoice, appointment kelas, dan jadwal konten mengikuti approval masing-masing.</p></article>
        </div>
      </section>

      <section className="bp-section" aria-labelledby="bpMemoryTitle">
        <div className="bp-section-head"><div><span className="bp-section-label">Hal yang disimpan di memori</span><h2 id="bpMemoryTitle">Simpan intisari, bukan chat mentah</h2></div><p>Materi kelas disimpan jangka panjang. PioStudio hanya memakai konteks sementara saat bekerja dan menyimpan ringkasan setelah konten tayang.</p></div>
        <div className="bp-memory-intro"><div><strong>Rancangan memori PioAssist</strong><p>Ambil kembali konteks relevan tanpa memenuhi context window; ini rancangan arsitektur, bukan klaim bahwa vector memory sudah aktif.</p></div><div className="bp-memory-sample"><span>Short-term · Context Window</span><span>Long-term · Supabase + pgvector</span></div></div>
        <div className="bp-memory-architecture">
          <article><strong>Short-term · Context Window</strong><p>Konteks sesi untuk pekerjaan yang sedang berlangsung; draf PioStudio tidak menjadi arsip permanen.</p></article>
          <article className="long"><strong>Long-term · Supabase + pgvector</strong><p>Rencanakan vector database atau perpustakaan berbasis makna untuk mencari ingatan relevan lintas sesi secara semantik.</p></article>
        </div>
        <div className="bp-memory-grid">
          <article className="bp-memory"><strong>Profil bisnis dan kanal</strong><p>Layanan, jam kerja, kanal aktif, serta status Instagram yang ditangguhkan.</p><small>Sumber owner/web · sampai ada perubahan</small></article>
          <article className="bp-memory"><strong>Aturan kerja dan prioritas</strong><p>Priority Gate, 15 jam marketing/minggu, budget Rp500.000/bulan, batas 3 konten/minggu, buffer 20%, dan blok service siang maks. 2 jam.</p><small>Sumber owner/laporan · tinjau bulanan</small></article>
          <article className="bp-memory"><strong>Customer dan minat gadget</strong><p>Data customer seperlunya tersimpan di invoice PioSales; PioGrowth mencatat gadget yang ditanya atau disarankan.</p><small>Jangka panjang · tanpa menyimpan chat</small></article>
          <article className="bp-memory"><strong>Harga pasar PGRiset</strong><p>Model, kondisi, harga, tautan sumber, dan tanggal pengecekan listing.</p><small>Masa berlaku 14 hari · wajib riset ulang</small></article>
          <article className="bp-memory"><strong>Materi kelas dan template</strong><p>Materi pembelajaran yang disetujui, versi, sumber, serta template balasan/invoice.</p><small>Jangka panjang · diperbarui saat berubah</small></article>
          <article className="bp-memory"><strong>Keputusan dan batasan owner</strong><p>Persetujuan, larangan, dan prasyarat promosi seperti kelengkapan halaman AI Knowledge.</p><small>Sampai dicabut atau diganti owner</small></article>
          <article className="bp-memory"><strong>Status tugas dan follow-up</strong><p>Task ClickUp, tenggat, jadwal, dan tindak lanjut yang masih terbuka.</p><small>Simpan sampai tugas selesai</small></article>
        </div>
        <div className="bp-retention-note"><strong>Retensi konten PioStudio</strong><span>Draf hanya memakai short memory. Setelah diunggah atau diposting, simpan ringkasan topik, niche, kanal, tanggal, tautan, dan status—tanpa menyimpan chat mentah atau file video/gambar.</span></div>
        <div className="bp-principles"><div className="bp-principle"><strong>Simpan seperlunya</strong>Catat transaksi pada invoice dan gadget yang ditanya/disarankan; jangan simpan chat mentah, data rahasia, atau token integrasi.</div><div className="bp-principle"><strong>Media tetap di sumbernya</strong>Arsip posting berisi ringkasan dan tautan; file video/gambar tidak disalin ke memori.</div><div className="bp-principle"><strong>Aksi perlu persetujuan</strong>Dokumen, booking, dan publikasi hanya setelah gerbang owner terpenuhi.</div></div>
      </section>

      <footer className="bp-footer" aria-label="Status fitur dan platform">
        <div className="bp-live-statuses">
          <div className="bp-live-status"><span className="bp-status">Modul web · berjalan</span><p>Kalender · ClickUp + Drive · Riset Harga · PioSales</p></div>
          <div className="bp-live-status planned"><span className="bp-status planned">Integrasi · rancangan</span><p>Orkestrasi otomatis tiga jalur · PioCheck</p></div>
        </div>
        <div className="bp-footer-meta"><strong>PioAssist · Full-Stack Agentic Web App</strong><span>Peta Tools Agentic: kategori Antigravity · aksi otomatis masih tahap rancangan integrasi.</span></div>
      </footer>
    </div>
  )
}

export default BlueprintPage

const mountNode = document.getElementById('blueprint-root')
if (mountNode) createRoot(mountNode).render(<BlueprintPage />)

