// Utilitas bersama untuk seluruh tab.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

export const fmt = (value, digits = 4) =>
    value === null || value === undefined ? "-" : Number(value).toFixed(digits);

export const pct = (value) => `${Math.round(value * 100)}%`;

export const chips = (tokens, cls = "") =>
    `<span class="chips">${tokens.map((t) =>
        `<span class="chip ${cls}">${escapeHtml(t)}</span>`).join("")}</span>`;

export const errorBox = (error) =>
    `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;

/** Kerangka abu-abu selama data dimuat; teks hanya untuk pembaca layar. */
export const loading = (text = "Memuat...", rows = 3) => `
    <div class="skeleton" role="status">
        <span class="sr-only">${text}</span>
        ${'<div class="skeleton-row"><span></span><span></span><span></span></div>'.repeat(rows)}
    </div>`;


// ==========================================
// API
// ==========================================

export async function api(url, body, method = body ? "POST" : "GET") {
    const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.message || "Terjadi kesalahan pada server.");
    }
    return data;
}

// Ringkasan dataset dipakai beberapa tab, cukup diambil sekali
let summaryPromise = null;
export const getSummary = () => (summaryPromise ||= api("/api/dataset"));


// ==========================================
// GLOSARIUM: penjelasan istilah untuk orang awam
// ==========================================

export const GLOSSARY = {
    score: "Skor kemiripan (cosine similarity) antara 0 dan 1. Makin mendekati 1, makin mirip isi dokumen dengan query.",
    term: "Term = kata dasar hasil preprocessing. Contoh: \"images\" dan \"imaging\" sama-sama menjadi \"imag\".",
    stopword: "Kata umum (the, of, and, ...) yang muncul di hampir semua dokumen sehingga tidak membantu membedakan dokumen.",
    stem: "Stemming memotong kata ke bentuk dasarnya agar variasi kata dianggap sama: retrieving, retrieval menjadi retriev.",
    tf: "TF (Term Frequency): berapa kali sebuah term muncul. Makin sering muncul, makin penting term itu bagi dokumen tersebut.",
    df: "df (document frequency): jumlah dokumen yang memuat term.",
    idf: "IDF: ukuran kelangkaan term. Term yang jarang muncul di koleksi bernilai tinggi karena lebih khas.",
    tfidf: "Bobot TF-IDF = TF × IDF. Tinggi jika term sering muncul di dokumen ini tetapi jarang di dokumen lain.",
    norm: "Panjang vektor = akar dari jumlah kuadrat semua bobot. Dipakai agar dokumen panjang tidak otomatis menang.",
    cosine: "Cosine similarity membandingkan arah dua vektor: 1 = isinya searah (sangat mirip), 0 = tidak ada kata yang sama.",
    p5: "Precision@5: dari 5 hasil teratas, berapa bagian yang benar-benar relevan. 1,0 berarti kelima hasil relevan.",
    p10: "Precision@10: dari 10 hasil teratas, berapa bagian yang relevan.",
    r10: "Recall@10: dari semua dokumen relevan yang ada di koleksi, berapa bagian yang berhasil masuk 10 hasil teratas.",
    recall: "Recall: dari semua dokumen relevan di koleksi, berapa bagian yang berhasil ditemukan.",
    ap: "Average Precision: tinggi jika dokumen relevan berada di urutan paling atas.",
    map: "MAP (Mean Average Precision): rata-rata Average Precision semua query. Mengukur kualitas urutan hasil.",
    rr: "Reciprocal Rank = 1 / posisi dokumen relevan pertama. 1,0 berarti hasil pertama sudah relevan.",
    mrr: "MRR: rata-rata Reciprocal Rank. 1,0 berarti dokumen relevan selalu muncul di posisi pertama.",
    bprecision: "Precision Boolean: dari semua dokumen yang memenuhi query Boolean, berapa bagian yang relevan.",
    brecall: "Recall Boolean: dari semua dokumen relevan, berapa bagian yang memenuhi query Boolean.",
    f1: "F1: gabungan precision dan recall dalam satu angka. Tinggi hanya jika keduanya tinggi.",
    relevance: "Relevance judgment: penilaian manusia apakah sebuah dokumen sesuai kebutuhan informasi query. Dipakai sebagai kunci jawaban."
};

/** Ikon (i) yang menampilkan penjelasan saat diarahkan mouse atau difokus. */
export const tip = (key) => `
    <span class="tip" tabindex="0" role="button" data-tip="${escapeHtml(GLOSSARY[key])}"
          aria-label="Penjelasan: ${escapeHtml(GLOSSARY[key])}">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2V11"/><circle cx="8" cy="4.9" r=".6" class="dot"/></svg>
    </span>`;

/**
 * Satu tooltip bersama dengan position: fixed, agar tidak terpotong oleh
 * wadah ber-overflow (strip statistik, tabel yang bisa digeser).
 */
export function initTooltips() {
    const bubble = document.createElement("div");
    bubble.className = "tooltip";
    bubble.setAttribute("aria-hidden", "true");  // teksnya sudah ada di aria-label ikon
    document.body.append(bubble);

    const GAP = 8;
    let active = null;

    function show(icon) {
        active = icon;
        bubble.textContent = icon.dataset.tip;
        bubble.classList.add("visible");

        const box = icon.getBoundingClientRect();
        const { width, height } = bubble.getBoundingClientRect();
        const left = Math.min(
            Math.max(GAP, box.left + box.width / 2 - width / 2),
            window.innerWidth - width - GAP
        );
        const above = box.top - height - GAP;
        bubble.style.left = `${left}px`;
        bubble.style.top = `${above >= GAP ? above : box.bottom + GAP}px`;
    }

    function hide() {
        active = null;
        bubble.classList.remove("visible");
    }

    document.addEventListener("mouseover", (event) => {
        const icon = event.target.closest?.("[data-tip]");
        if (icon && icon !== active) show(icon);
        else if (!icon && active && document.activeElement !== active) hide();
    });
    document.addEventListener("focusin", (event) => {
        const icon = event.target.closest?.("[data-tip]");
        icon ? show(icon) : hide();
    });
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    // Fokus keyboard bisa menggulir halaman: ikuti ikonnya, jangan disembunyikan
    const follow = () => { if (active) show(active); };
    window.addEventListener("scroll", follow, { passive: true, capture: true });
    window.addEventListener("resize", follow);
}


// ==========================================
// PENANDA KATA DAN JEJAK PREPROCESSING
// ==========================================

/** Menebalkan kata yang cocok dengan query. Teks di-escape per bagian agar aman. */
export function highlight(text, words) {
    if (!words?.length) return escapeHtml(text);
    const pattern = new RegExp(`\\b(${words.join("|")})\\b`, "gi");
    return String(text).split(pattern).map((part, index) =>
        index % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)).join("");
}

/** Satu kata hasil preprocessing: dicoret jika dibuang, diberi kata dasar jika berubah. */
export function traceWord(item) {
    if (item.removed === "stopword") {
        return `<del class="tk stop" title="Dibuang: kata umum (stopword)">${escapeHtml(item.word)}</del>`;
    }
    if (item.removed) {
        return `<del class="tk norm" title="Dibuang: token 1 huruf (normalisasi)">${escapeHtml(item.word)}</del>`;
    }
    if (item.term !== item.word) {
        return `<span class="tk keep" title="Kata dasar: ${escapeHtml(item.term)}">${escapeHtml(item.word)}<span class="arrow" aria-hidden="true">→</span><b>${escapeHtml(item.term)}</b></span>`;
    }
    return `<span class="tk keep"><b>${escapeHtml(item.word)}</b></span>`;
}

export const traceLegend = `
    <div class="legend" aria-hidden="true">
        <span><span class="tk keep"><b>kata</b></span> disimpan</span>
        <span><span class="tk keep">images<span class="arrow">→</span><b>imag</b></span> diubah ke kata dasar</span>
        <span><del class="tk stop">the</del> kata umum dibuang</span>
        <span><del class="tk norm">e</del> token 1 huruf dibuang</span>
    </div>`;


// ==========================================
// TAB (dapat dipakai dengan keyboard)
// ==========================================

const tabLoaders = {};
const loadedTabs = new Set();

export function registerTab(name, loader) {
    tabLoaders[name] = loader;
}

export function openTab(name, { skipLoad = false } = {}) {
    $$('[role="tab"]').forEach((tab) => {
        const active = tab.dataset.tab === name;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active);
        tab.tabIndex = active ? 0 : -1;
    });
    $$('[role="tabpanel"]').forEach((panel) => {
        panel.hidden = panel.id !== `tab-${name}`;
    });

    // Judul halaman di header mengikuti menu yang aktif
    const tab = $(`[role="tab"][data-tab="${name}"]`);
    $("#page-title").textContent = tab.dataset.title;
    $("#page-desc").textContent = tab.dataset.desc;
    document.title = `${tab.dataset.title} · Academic Paper Retrieval`;
    window.scrollTo({ top: 0 });

    if (!loadedTabs.has(name)) {
        loadedTabs.add(name);
        if (!skipLoad) tabLoaders[name]?.();
    }
}

export function initTabs() {
    const tabs = $$('[role="tab"]');

    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => openTab(tab.dataset.tab));
        tab.addEventListener("keydown", (event) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
            if (step) event.preventDefault();  // jangan ikut menggulir halaman
            if (!step) return;
            const next = tabs[(index + step + tabs.length) % tabs.length];
            next.focus();
            openTab(next.dataset.tab);
        });
    });
}
