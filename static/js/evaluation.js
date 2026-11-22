// Tab Evaluasi: ringkasan metrik, perbandingan model, dan kelola query uji.

import { $, $$, api, errorBox, escapeHtml, fmt, getSummary, loading, pct, tip } from "./common.js";
import { barChart, modelComparisonChart, SERIES } from "./charts.js";

let editingId = null;


// ==========================================
// HASIL EVALUASI
// ==========================================

export async function loadEvaluation() {
    loadQueryTable();
    $("#evaluation-result").innerHTML = loading("Menghitung evaluasi...");

    try {
        const data = await api("/api/evaluation");
        $("#evaluation-result").innerHTML = data.queries.length
            ? renderEvaluation(data)
            : '<div class="card empty">Belum ada query uji. Tambahkan minimal 10 query di bagian "Kelola Query Uji".</div>';
    } catch (error) {
        $("#evaluation-result").innerHTML = errorBox(error);
    }
}

const stat = (value, name, key, sentence) => `
    <div class="stat">
        <div class="value">${value}</div>
        <div class="name">${name} ${tip(key)}</div>
        <div class="explain">${sentence}</div>
    </div>`;

const docItems = (docs, ranked = false) => docs.length
    ? `<ul class="doclist">${docs.map((d, i) => `
        <li><span class="badge ${d.relevant ? "good" : "bad"}">${d.relevant ? "Relevan" : "Tidak"}</span>
            <span>${ranked ? `#${i + 1} ` : ""}[${d.doc_id}] ${escapeHtml(d.title)}</span></li>`).join("")}</ul>`
    : '<p class="muted small">Tidak ada.</p>';

function conclusion(s) {
    const vsmFindsMore = s.vsm.r10 > s.boolean.recall;
    const booleanStricter = s.boolean.precision > s.vsm.p10;

    return `
        <div class="card callout-info">
            <h2>Kesimpulan</h2>
            <p class="lead">${vsmFindsMore
                ? "VSM lebih cocok sebagai mesin pencari: lebih banyak dokumen relevan yang ditemukan, dan dokumen relevan hampir selalu muncul paling atas."
                : "Boolean menemukan dokumen relevan sebanyak atau lebih banyak dari VSM pada query uji ini."}</p>
            <ul>
                <li>VSM menemukan <b>${pct(s.vsm.r10)}</b> dokumen relevan di 10 hasil teratas, Boolean <b>${pct(s.boolean.recall)}</b>.</li>
                <li>${booleanStricter
                    ? `Boolean lebih jarang salah (<b>${pct(s.boolean.precision)}</b> hasilnya relevan) karena hanya mengembalikan dokumen yang memuat semua syarat, tetapi akibatnya banyak dokumen relevan terlewat.`
                    : `VSM juga lebih presisi (${pct(s.vsm.p10)} vs ${pct(s.boolean.precision)}).`}</li>
                <li>Pada VSM, dokumen relevan pertama rata-rata muncul di <b>posisi ${fmt(1 / (s.vsm.mrr || 1), 1)}</b>. Boolean tidak mengurutkan hasil, jadi pengguna harus memeriksa semuanya.</li>
            </ul>
        </div>`;
}

function renderEvaluation(data) {
    const s = data.summary;
    const q = data.queries;
    const worstBoolean = q.reduce((a, b) => (b.boolean.precision < a.boolean.precision ? b : a));
    const ceiling = q.filter((r) => r.relevant_count < 10).length;

    return `
        ${conclusion(s)}

        <h2 class="section-title">Vector Space Model <span class="muted small">(rata-rata ${q.length} query)</span></h2>
        <div class="stats">
            ${stat(fmt(s.vsm.p5, 2), "Precision@5", "p5", `rata-rata ${fmt(s.vsm.p5 * 5, 1)} dari 5 hasil teratas relevan`)}
            ${stat(fmt(s.vsm.p10, 2), "Precision@10", "p10", `rata-rata ${fmt(s.vsm.p10 * 10, 1)} dari 10 hasil teratas relevan`)}
            ${stat(fmt(s.vsm.r10, 2), "Recall@10", "r10", `${pct(s.vsm.r10)} dokumen relevan masuk 10 besar`)}
            ${stat(fmt(s.vsm.map, 2), "MAP", "map", "kualitas urutan hasil (maks 1)")}
            ${stat(fmt(s.vsm.mrr, 2), "MRR", "mrr", `relevan pertama rata-rata di posisi ${fmt(1 / (s.vsm.mrr || 1), 1)}`)}
        </div>

        <h2 class="section-title">Boolean Retrieval</h2>
        <div class="stats">
            ${stat(fmt(s.boolean.precision, 2), "Precision", "bprecision", `${pct(s.boolean.precision)} hasil Boolean relevan`)}
            ${stat(fmt(s.boolean.recall, 2), "Recall", "brecall", `${pct(s.boolean.recall)} dokumen relevan ditemukan`)}
            ${stat(fmt(s.boolean.f1, 2), "F1", "f1", "keseimbangan precision dan recall")}
        </div>

        <div class="chart-grid">
            <div class="card">
                <h2>VSM vs Boolean</h2>
                ${modelComparisonChart(s, fmt)}
            </div>
            <div class="card">
                <h2>Precision@5 VSM per Query ${tip("p5")}</h2>
                ${barChart({
                    rows: q.map((r) => ({ label: r.id, values: [r.vsm.p5] })),
                    series: [SERIES.vsm],
                    max: 1,
                    format: (v) => fmt(v, 2)
                })}
            </div>
        </div>

        <div class="card">
            <h2>Recall per Query: Dokumen Relevan yang Ditemukan ${tip("recall")}</h2>
            <p class="muted small">Semakin panjang batang, semakin banyak dokumen relevan yang berhasil ditemukan model.</p>
            ${barChart({
                rows: q.map((r) => ({ label: `${r.id} · ${r.query}`, values: [r.vsm.r10, r.boolean.recall] })),
                series: [{ ...SERIES.vsm, name: "VSM (10 teratas)" }, SERIES.boolean],
                max: 1,
                format: (v) => fmt(v, 2)
            })}
        </div>

        <div class="card">
            <h2>Kenapa Hasilnya Berbeda?</h2>
            <ul>
                <li><b>VSM memberi nilai, Boolean memberi ya/tidak.</b> VSM tetap menampilkan dokumen yang memuat sebagian kata query (diurutkan dari yang paling mirip). Boolean menolak dokumen yang tidak memenuhi semua syarat, sehingga recall-nya lebih rendah.</li>
                <li><b>Precision@10 VSM terlihat rendah</b> karena VSM selalu mengisi 10 posisi, padahal ${ceiling} dari ${q.length} query hanya punya kurang dari 10 dokumen relevan di koleksi (lihat kolom "P@10 maks").</li>
                <li><b>Boolean sensitif terhadap pilihan kata.</b> Contoh: ${worstBoolean.id} <code>${escapeHtml(worstBoolean.boolean_query)}</code> menemukan ${worstBoolean.boolean.retrieved_count} dokumen dengan precision hanya ${pct(worstBoolean.boolean.precision)}, karena kata yang terlalu umum membuat banyak dokumen tidak relevan ikut memenuhi syarat.</li>
            </ul>
        </div>

        <div class="card">
            <h2>Hasil per Query</h2>
            <div class="table-wrap"><table>
                <thead>
                <tr><th rowspan="2">ID</th><th rowspan="2">Query</th><th rowspan="2" class="num">Jml relevan</th>
                    <th colspan="5" class="group">VSM</th><th colspan="3" class="group">Boolean</th></tr>
                <tr><th class="num">P@5</th><th class="num">P@10</th><th class="num">P@10 maks*</th><th class="num">R@10</th><th class="num">AP</th>
                    <th class="num">Ditemukan</th><th class="num">P</th><th class="num">R</th></tr>
                </thead>
                <tbody>
                ${q.map((r) => `
                <tr><td>${escapeHtml(r.id)}</td>
                    <td>${escapeHtml(r.query)}<br><code class="small">${escapeHtml(r.boolean_query)}</code></td>
                    <td class="num">${r.relevant_count}</td>
                    <td class="num">${fmt(r.vsm.p5, 2)}</td><td class="num">${fmt(r.vsm.p10, 2)}</td>
                    <td class="num muted">${fmt(Math.min(r.relevant_count, 10) / 10, 2)}</td>
                    <td class="num">${fmt(r.vsm.r10, 2)}</td><td class="num">${fmt(r.vsm.ap, 2)}</td>
                    <td class="num">${r.boolean.retrieved_count}</td>
                    <td class="num">${fmt(r.boolean.precision, 2)}</td><td class="num">${fmt(r.boolean.recall, 2)}</td></tr>`).join("")}
                </tbody>
            </table></div>
            <p class="muted small">* P@10 maks = nilai P@10 tertinggi yang mungkin, jika semua dokumen relevan masuk 10 besar.</p>
        </div>

        <div class="card callout">
            <b>Keterbatasan evaluasi.</b> Koleksi hanya 100 paper dengan topik ilmu komputer yang sangat beragam, sehingga
            banyak query hanya memiliki sedikit dokumen relevan. Relevance judgment ${tip("relevance")} dibuat berdasarkan judul
            dan abstrak, sehingga masih mengandung subjektivitas penilai.
        </div>

        <div class="card">
            <h2>Dokumen Relevan dan Tidak Relevan per Query</h2>
            <p class="muted">Klik sebuah query untuk melihat dokumen yang ditemukan masing-masing model.</p>
            <p class="muted small">Kriteria: ${escapeHtml(data.criteria)}</p>
            ${q.map((r) => `
            <details class="query-detail">
                <summary><b>${escapeHtml(r.id)}</b> · ${escapeHtml(r.query)}
                    <span class="muted small">· VSM P@5 ${fmt(r.vsm.p5, 2)} · Boolean ${r.boolean.retrieved_count} dokumen</span></summary>
                <p class="muted">Kebutuhan informasi: ${escapeHtml(r.information_need)}</p>
                <div class="cols">
                    <div>
                        <h4>VSM: 10 hasil teratas</h4>
                        ${docItems(r.vsm.top10, true)}
                        <h4>Relevan tapi tidak masuk 10 besar</h4>
                        ${docItems(r.vsm.missed)}
                    </div>
                    <div>
                        <h4>Boolean: <code>${escapeHtml(r.boolean_query)}</code></h4>
                        ${docItems(r.boolean.retrieved)}
                        <h4>Relevan tapi tidak ditemukan</h4>
                        ${docItems(r.boolean.missed)}
                    </div>
                </div>
            </details>`).join("")}
        </div>`;
}


// ==========================================
// KELOLA QUERY UJI
// ==========================================

const parseIds = (text) =>
    [...new Set(text.split(/[\s,;]+/).filter(Boolean).map(Number))];

// Daftar query uji di-cache; dikosongkan setiap kali query uji disimpan/dihapus
let queriesPromise = null;
const getQueries = () => (queriesPromise ||= api("/api/queries").then((d) => d.queries));
const invalidateQueries = () => { queriesPromise = null; };

const normalize = (text) => String(text).trim().toLowerCase().replace(/\s+/g, " ");

/** Query uji yang teksnya sama dengan pencarian (VSM: query, Boolean: query Boolean). */
export async function findTestQuery(text, method) {
    const field = method === "boolean" ? "boolean_query" : "query";
    const queries = await getQueries().catch(() => []);
    return queries.find((q) => normalize(q[field]) === normalize(text)) || null;
}

async function loadQueryTable() {
    try {
        const queries = await getQueries();

        $("#query-count").innerHTML = queries.length < 10
            ? `<p class="error">${queries.length} query uji tersimpan. Ketentuan UAS mewajibkan minimal 10 query pengujian.</p>`
            : `<p class="muted">${queries.length} query uji tersimpan di <code>evaluation/queries.json</code>.</p>`;

        $("#query-table").innerHTML = `
            <div class="table-wrap"><table>
                <thead><tr><th>ID</th><th>Query VSM</th><th>Query Boolean</th><th>Dokumen relevan</th><th><span class="sr-only">Aksi</span></th></tr></thead>
                <tbody>
                ${queries.map((q) => `
                <tr data-query='${escapeHtml(JSON.stringify(q))}'>
                    <td>${escapeHtml(q.id)}</td><td>${escapeHtml(q.query)}</td>
                    <td><code>${escapeHtml(q.boolean_query)}</code></td>
                    <td>${q.relevant.join(", ")}</td>
                    <td class="num nowrap">
                        <button type="button" class="btn-secondary btn-small" data-action="edit">Edit</button>
                        <button type="button" class="btn-secondary btn-small btn-danger" data-action="delete">Hapus</button>
                    </td></tr>`).join("")}
                </tbody>
            </table></div>`;
    } catch (error) {
        $("#query-table").innerHTML = errorBox(error);
    }
}

export function openQueryForm(item = {}, id = null) {
    editingId = id;
    $("#manage").open = true;
    $("#query-form-title").textContent = id ? `Edit query uji ${id}` : "Tambah query uji";
    $("#qf-query").value = item.query || "";
    $("#qf-boolean").value = item.boolean_query || "";
    $("#qf-need").value = item.information_need || "";
    $("#qf-relevant").value = (item.relevant || []).join(", ");
    $("#qf-error").innerHTML = "";
    $("#qf-candidate-list").innerHTML = "";
    $("#query-form").hidden = false;
    $("#query-form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#qf-query").focus({ preventScroll: true });
    updatePreview();
}

function closeQueryForm() {
    $("#query-form").hidden = true;
    editingId = null;
}

async function updatePreview() {
    const ids = parseIds($("#qf-relevant").value);
    $$("[data-candidate]").forEach((box) => {
        box.checked = ids.includes(Number(box.dataset.candidate));
    });

    if (!ids.length) {
        $("#qf-preview").innerHTML = "";
        return;
    }

    const { documents } = await getSummary();
    const titles = Object.fromEntries(documents.map((d) => [d.id, d.title]));

    $("#qf-preview").innerHTML = `<ul class="doclist">${ids.map((id) => titles[id]
        ? `<li><span class="badge good">${id}</span> ${escapeHtml(titles[id])}</li>`
        : `<li><span class="badge bad">${escapeHtml(id)}</span> tidak ada di dataset</li>`).join("")}</ul>`;
}

async function showCandidates() {
    const query = $("#qf-query").value.trim();
    if (!query) {
        $("#qf-candidate-list").innerHTML = errorBox(new Error("Isi Query VSM terlebih dahulu."));
        return;
    }

    try {
        const data = await api("/search", { query, method: "vsm", top_k: 10 });
        const candidates = data.results.filter((d) => d["Similarity Score"] > 0);
        const selected = parseIds($("#qf-relevant").value);

        $("#qf-candidate-list").innerHTML = candidates.length ? `
            <p class="muted small">Baca judulnya, lalu centang dokumen yang relevan. Dokumen relevan di luar daftar ini tetap bisa diketik manual.</p>
            ${candidates.map((d) => `
            <label class="candidate">
                <input type="checkbox" data-candidate="${d["Document ID"]}" ${selected.includes(d["Document ID"]) ? "checked" : ""}>
                <span><b>[${d["Document ID"]}]</b> ${escapeHtml(d.Title)}
                    <span class="muted">· skor ${fmt(d["Similarity Score"], 3)}</span></span>
            </label>`).join("")}` : '<p class="muted">Tidak ada dokumen yang memuat kata dari query ini.</p>';
    } catch (error) {
        $("#qf-candidate-list").innerHTML = errorBox(error);
    }
}

async function saveQuery(event) {
    event.preventDefault();

    const body = {
        query: $("#qf-query").value,
        boolean_query: $("#qf-boolean").value,
        information_need: $("#qf-need").value,
        relevant: parseIds($("#qf-relevant").value)
    };

    try {
        await api(editingId ? `/api/queries/${encodeURIComponent(editingId)}` : "/api/queries",
                  body, editingId ? "PUT" : "POST");
        invalidateQueries();
        closeQueryForm();
        loadEvaluation();
    } catch (error) {
        $("#qf-error").innerHTML = errorBox(error);
    }
}

async function removeQuery(id) {
    if (!confirm(`Hapus query uji ${id}? Perubahan langsung disimpan ke evaluation/queries.json.`)) return;
    try {
        await api(`/api/queries/${encodeURIComponent(id)}`, null, "DELETE");
        invalidateQueries();
        if (editingId === id) closeQueryForm();
        loadEvaluation();
    } catch (error) {
        alert(error.message);
    }
}

export function initEvaluation() {
    $("#add-query").addEventListener("click", () => openQueryForm());
    $("#open-manage").addEventListener("click", () => {
        $("#manage").open = true;
        $("#manage").scrollIntoView({ behavior: "smooth" });
    });
    $("#qf-cancel").addEventListener("click", closeQueryForm);
    $("#qf-relevant").addEventListener("input", updatePreview);
    $("#qf-candidates").addEventListener("click", showCandidates);
    $("#query-form").addEventListener("submit", saveQuery);

    $("#qf-candidate-list").addEventListener("change", (event) => {
        const id = Number(event.target.dataset.candidate);
        if (Number.isNaN(id)) return;
        const ids = parseIds($("#qf-relevant").value).filter((x) => x !== id);
        if (event.target.checked) ids.push(id);
        $("#qf-relevant").value = ids.sort((a, b) => a - b).join(", ");
        updatePreview();
    });

    $("#query-table").addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const q = JSON.parse(button.closest("tr").dataset.query);
        if (button.dataset.action === "edit") openQueryForm(q, q.id);
        if (button.dataset.action === "delete") removeQuery(q.id);
    });
}
