// Tab Pencarian: VSM, Boolean, mode Bandingkan, dan evaluasi langsung.

import {
    $, $$, api, chips, errorBox, escapeHtml, fmt, highlight, loading,
    openTab, pct, tip, traceWord
} from "./common.js";
import { showDocument } from "./dataset.js";
import { runExplain } from "./explain.js";
import { findTestQuery, openQueryForm } from "./evaluation.js";

const HINTS = {
    vsm: "Tulis kata kunci bebas. Setiap dokumen diberi skor kemiripan, lalu diurutkan dari yang paling mirip.",
    boolean: "Dokumen hanya ditampilkan jika memenuhi syarat logika. Gunakan AND (harus ada semua), OR (salah satu), NOT (tidak boleh ada), dan tanda kurung. Dua kata tanpa operator dianggap AND.",
    compare: "Query yang sama dijalankan dengan kedua model lalu ditampilkan berdampingan, agar perbedaannya terlihat."
};

const ABSTRACT_PREVIEW = 300;

let current = null;   // hasil pencarian terakhir (mode tunggal) untuk evaluasi langsung


// ==========================================
// FORM
// ==========================================

const selectedMethod = () => $('input[name="method"]:checked').value;
const selectedTopK = () => Number($('input[name="top_k"]:checked').value);

export function initSearch() {
    $$('input[name="method"]').forEach((radio) =>
        radio.addEventListener("change", () => { $("#method-hint").textContent = HINTS[radio.value]; }));

    $("#search-examples").addEventListener("click", (event) => {
        const button = event.target.closest("[data-q]");
        if (!button) return;
        $("#query").value = button.dataset.q;
        const radio = $(`input[name="method"][value="${button.dataset.m}"]`);
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
        $("#search-form").requestSubmit();
    });

    $("#search-form").addEventListener("submit", (event) => {
        event.preventDefault();
        search($("#query").value.trim(), selectedMethod(), selectedTopK());
    });

    $("#search-results").addEventListener("click", onResultClick);
    $("#search-results").addEventListener("change", onJudge);
    $("#live-eval").addEventListener("change", (event) => {
        if (event.target.id !== "live-total" || !current) return;
        current.totalOverride = Number(event.target.value) || 0;
        updateLiveEval();
    });
    $("#live-eval").addEventListener("click", (event) => {
        if (event.target.id === "save-as-test") saveAsTestQuery();
    });
}

async function search(query, method, topK) {
    current = null;
    $("#search-summary").innerHTML = "";
    $("#live-eval").innerHTML = "";
    $("#search-results").innerHTML = loading("Mencari...");

    if (method === "compare") {
        return renderCompare(query, topK);
    }

    try {
        const data = await api("/search", { query, method, top_k: topK });
        renderSingle(data, topK);
    } catch (error) {
        $("#search-results").innerHTML = errorBox(error);
    }
}


// ==========================================
// RINGKASAN QUERY
// ==========================================

function querySummary(data) {
    const kept = data.trace.filter((t) => t.term);
    const removed = data.trace.filter((t) => t.removed);

    return `
        <div class="summary">
            <div><b>Query Anda setelah diproses</b> ${tip("term")}</div>
            <div class="trace-inline">${data.trace.map(traceWord).join(" ") || '<span class="muted">(kosong)</span>'}</div>
            <div class="muted small">
                ${kept.length ? `Yang dicari di dokumen: ${chips(kept.map((t) => t.term))}` : "Tidak ada kata yang bisa dicari."}
                ${removed.length ? ` · ${removed.length} kata diabaikan karena terlalu umum` : ""}
            </div>
        </div>`;
}


// ==========================================
// HASIL (VSM / BOOLEAN)
// ==========================================

function resultCard(doc, index, { isVsm, maxScore, isTie, compact = false }) {
    const score = doc["Similarity Score"];
    const rank = isVsm ? doc.Rank : index + 1;
    const id = doc["Document ID"];
    const abstract = doc.Abstract || "";
    const long = abstract.length > ABSTRACT_PREVIEW;
    const preview = long ? abstract.slice(0, ABSTRACT_PREVIEW) + "..." : abstract;

    const scoreRow = isVsm ? `
        <div class="score-row">
            <span class="score"><b>${pct(score)}</b> mirip</span>
            <span class="bar" aria-hidden="true"><span style="width:${maxScore ? (score / maxScore) * 100 : 0}%"></span></span>
            <span class="muted small">skor ${fmt(score, 3)} ${tip("score")}</span>
            ${isTie ? '<span class="badge info">skor sama: urut Doc ID</span>' : ""}
        </div>` : `
        <div class="score-row"><span class="badge good">Memenuhi syarat query</span>
            <span class="muted small">Boolean tidak memberi skor</span></div>`;

    return `
    <article class="result" data-id="${id}">
        <div class="rank" aria-label="Peringkat ${rank}">${rank}</div>
        <div class="result-body">
            <h3>${highlight(doc.Title, doc["Matched Words"])}</h3>
            <div class="meta">${doc.Year} · ${escapeHtml(doc.Venue)} · Doc ID ${id}</div>
            ${scoreRow}
            ${compact ? "" : `
            <p class="abstract" data-full="${long ? escapeHtml(abstract) : ""}">${highlight(preview, doc["Matched Words"])}</p>
            <div class="result-actions">
                <label class="judge"><input type="checkbox" data-judge="${id}"> Relevan</label>
                ${long ? '<button type="button" class="btn-link" data-action="full">Abstrak lengkap</button>' : ""}
                <button type="button" class="btn-link" data-action="doc">Lihat preprocessing dokumen</button>
                ${isVsm ? '<button type="button" class="btn-link" data-action="explain">Kenapa skornya segini?</button>' : ""}
            </div>`}
        </div>
    </article>`;
}

function resultList(data, { compact = false } = {}) {
    const isVsm = data.method === "vsm";
    const maxScore = isVsm ? data.results[0]?.["Similarity Score"] : 0;

    if (!data.results.length) {
        return `<div class="card empty">Tidak ada dokumen yang ${isVsm ? "memuat kata dari query" : "memenuhi syarat query"}.</div>`;
    }

    return `<div class="result-list">${data.results.map((doc, index) => {
        const score = doc["Similarity Score"];
        const isTie = isVsm && score > 0 && [data.results[index - 1], data.results[index + 1]]
            .some((other) => other?.["Similarity Score"] === score);
        return resultCard(doc, index, { isVsm, maxScore, isTie, compact });
    }).join("")}</div>`;
}

function renderSingle(data, topK) {
    const isVsm = data.method === "vsm";
    current = { ...data, topK, relevant: new Set(), testQuery: null };

    $("#search-summary").innerHTML = querySummary(data) + `
        <p class="result-count">
            <b>${data.total_matches}</b> dokumen ${isVsm ? "memuat setidaknya satu kata dari query" : "memenuhi syarat query"}.
            Menampilkan ${data.results.length} teratas${isVsm ? ", diurutkan dari yang paling mirip" : ", diurutkan berdasarkan Doc ID"}.
        </p>`;

    $("#search-results").innerHTML = resultList(data);
    if (data.results.length) applyTestQuery(current);
}

/** Jika pencarian ini sudah menjadi query uji, centang dokumen dari kunci jawabannya. */
async function applyTestQuery(search) {
    const testQuery = await findTestQuery(search.query, search.method);
    if (search !== current) return;  // sudah ada pencarian baru

    if (testQuery) {
        search.testQuery = testQuery;
        const shown = new Set(search.results.map((d) => d["Document ID"]));
        testQuery.relevant.filter((id) => shown.has(id)).forEach((id) => {
            search.relevant.add(id);
            const box = $(`[data-judge="${id}"]`);
            box.checked = true;
            box.closest(".result").classList.add("judged-relevant");
        });
    }
    updateLiveEval();
}

function onResultClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest(".result");

    if (button.dataset.action === "full") {
        const abstract = card.querySelector(".abstract");
        const doc = current.results.find((d) => d["Document ID"] === Number(card.dataset.id));
        abstract.innerHTML = highlight(doc.Abstract, doc["Matched Words"]);
        button.remove();
    }
    if (button.dataset.action === "doc") {
        openTab("dataset");
        showDocument(Number(card.dataset.id));
    }
    if (button.dataset.action === "explain") {
        openTab("explain", { skipLoad: true });
        runExplain(current.query);
    }
}


// ==========================================
// MODE BANDINGKAN
// ==========================================

async function renderCompare(query, topK) {
    const [vsm, boolean] = await Promise.allSettled([
        api("/search", { query, method: "vsm", top_k: topK }),
        api("/search", { query, method: "boolean", top_k: topK })
    ]);

    if (vsm.status === "rejected") {
        $("#search-results").innerHTML = errorBox(vsm.reason);
        return;
    }

    const v = vsm.value;
    const b = boolean.status === "fulfilled" ? boolean.value : null;
    const vsmIds = new Set(v.results.map((d) => d["Document ID"]));
    const both = b ? b.results.filter((d) => vsmIds.has(d["Document ID"])).length : 0;

    $("#search-summary").innerHTML = querySummary(v) + `
        <div class="card compare-summary">
            <h2>Apa bedanya?</h2>
            <ul>
                <li><b>VSM</b> menemukan <b>${v.total_matches}</b> dokumen yang memuat <i>setidaknya satu</i> kata dari query, lalu mengurutkannya dari yang paling mirip.</li>
                <li><b>Boolean</b> ${b
                    ? `menemukan <b>${b.total_matches}</b> dokumen yang memuat <i>semua</i> kata (dua kata tanpa operator = AND), tanpa urutan kemiripan.`
                    : `tidak bisa menjalankan query ini: ${escapeHtml(boolean.reason.message)}`}</li>
                ${b ? `<li><b>${both}</b> dokumen muncul di kedua hasil Top-${topK}.</li>` : ""}
            </ul>
            <p class="muted small">Evaluasi langsung (centang Relevan) tersedia saat memilih satu metode saja.</p>
        </div>`;

    const column = (title, data) => `
        <section aria-label="${title}">
            <h2 class="column-title">${title}</h2>
            ${data ? resultList(data, { compact: true }) : errorBox(boolean.reason)}
        </section>`;

    $("#search-results").innerHTML = `
        <div class="compare">
            ${column("Vector Space Model", v)}
            ${column("Boolean Retrieval", b)}
        </div>`;

    // Tandai dokumen yang muncul di kedua kolom
    if (b) {
        const boolIds = new Set(b.results.map((d) => d["Document ID"]));
        $$("#search-results .result").forEach((card) => {
            const id = Number(card.dataset.id);
            if (vsmIds.has(id) && boolIds.has(id)) {
                card.querySelector(".meta").insertAdjacentHTML("beforeend",
                    ' · <span class="badge info">ada di kedua hasil</span>');
            }
        });
    }
}


// ==========================================
// EVALUASI LANGSUNG
// ==========================================

function onJudge(event) {
    const box = event.target;
    if (!box.dataset.judge || !current) return;

    const id = Number(box.dataset.judge);
    box.checked ? current.relevant.add(id) : current.relevant.delete(id);
    box.closest(".result").classList.toggle("judged-relevant", box.checked);
    updateLiveEval();
}

let evalRequest = 0;

async function updateLiveEval() {
    if (!current) return;
    const ranked = current.results.map((d) => d["Document ID"]);
    // Jumlah relevan di koleksi: isian pengguna, atau dari kunci jawaban query uji
    const totalRelevant = current.totalOverride
        || (current.testQuery ? mergedRelevant().length : 0);
    const requestId = ++evalRequest;

    try {
        const m = await api("/api/metrics", {
            ranked, relevant: [...current.relevant], total_relevant: totalRelevant
        });
        if (requestId !== evalRequest) return;  // ada centang yang lebih baru
        renderLiveEval(m, totalRelevant);
    } catch (error) {
        $("#live-eval").innerHTML = errorBox(error);
    }
}

function renderLiveEval(m, totalRelevant) {
    const isVsm = current.method === "vsm";
    const ks = Object.keys(m.precision).map(Number);
    const marked = current.relevant.size;
    const testQuery = current.testQuery;
    const saveCount = testQuery ? mergedRelevant().length : marked;
    const shown = new Set(current.results.map((d) => d["Document ID"]));
    const outside = testQuery ? testQuery.relevant.filter((id) => !shown.has(id)).length : 0;

    const stat = (value, name, key, detail) => `
        <div class="stat">
            <div class="value">${value}</div>
            <div class="name">${name} ${tip(key)}</div>
            <div class="explain">${detail}</div>
        </div>`;

    const precisionStats = ks.map((k) => stat(
        fmt(m.precision[k], 2), `Precision@${k}`, k === 5 ? "p5" : "p10",
        `${m.hits[k]} dari ${k} hasil teratas relevan`)).join("");

    const recallStats = m.recall ? ks.map((k) => stat(
        fmt(m.recall[k], 2), `Recall@${k}`, "recall",
        `${m.hits[k]} dari ${totalRelevant} dokumen relevan ditemukan`)).join("") : "";

    $("#live-eval").innerHTML = `
        <div class="card live-eval">
            <h2>Evaluasi Langsung</h2>
            <p class="muted">Centang <b>Relevan</b> pada hasil yang sesuai dengan yang Anda cari. Angka di bawah dihitung ulang setiap kali dicentang.
                ${isVsm ? "" : "Hasil Boolean tidak berperingkat, jadi posisi mengikuti urutan Doc ID."}</p>
            ${marked ? `
            <div class="stats">
                ${precisionStats}
                ${recallStats}
                ${stat(fmt(m.ap, 2), "Average Precision", "ap", `dibagi ${m.ap_denominator} dokumen relevan`)}
                ${stat(fmt(m.rr, 2), "Reciprocal Rank", "rr",
                    m.first_relevant_rank ? `relevan pertama di posisi ${m.first_relevant_rank}` : "belum ada")}
            </div>` : '<p class="hint-box">Belum ada dokumen yang dicentang.</p>'}
            ${testQuery ? `
            <p class="hint-box">Query ini adalah query uji <b>${escapeHtml(testQuery.id)}</b>. Centang awal diambil dari
                kunci jawabannya (${testQuery.relevant.length} dokumen relevan${outside ? `, ${outside} di antaranya di luar hasil yang ditampilkan` : ""}).</p>` : ""}
            <label class="inline-input">Jumlah dokumen relevan di seluruh koleksi ${testQuery ? "(otomatis dari kunci jawaban)" : "(opsional, untuk Recall)"}
                <input type="number" id="live-total" min="0" max="100" value="${totalRelevant || ""}">
            </label>
            <div class="form-actions">
                <button type="button" id="save-as-test" class="btn-secondary" ${saveCount ? "" : "disabled"}>
                    ${testQuery
                        ? `Perbarui kunci jawaban ${escapeHtml(testQuery.id)} (${saveCount} dokumen relevan)`
                        : `Simpan sebagai query uji (${saveCount} dokumen relevan)`}</button>
            </div>
        </div>`;
}

/**
 * Kunci jawaban baru: dokumen yang tampil mengikuti centang saat ini,
 * dokumen relevan di luar hasil yang tampil tetap dipertahankan.
 */
function mergedRelevant() {
    const shown = new Set(current.results.map((d) => d["Document ID"]));
    const kept = (current.testQuery?.relevant || []).filter((id) => !shown.has(id));
    return [...new Set([...kept, ...current.relevant])].sort((a, b) => a - b);
}

function saveAsTestQuery() {
    const isVsm = current.method === "vsm";
    const testQuery = current.testQuery;
    openTab("evaluation");

    if (testQuery) {
        openQueryForm({ ...testQuery, relevant: mergedRelevant() }, testQuery.id);
        return;
    }
    openQueryForm({
        query: isVsm ? current.query : "",
        boolean_query: isVsm ? "" : current.query,
        relevant: [...current.relevant]
    });
}
