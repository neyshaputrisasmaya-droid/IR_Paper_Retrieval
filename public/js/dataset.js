// Tab Dataset & Preprocessing.

import {
    $, api, chips, errorBox, escapeHtml, getSummary, loading, tip,
    traceLegend, traceWord
} from "./common.js";
import { barChart, SERIES } from "./charts.js";

const STAGES = [
    {
        key: "tokenization", label: "Tokenization",
        what: "Teks dipecah menjadi kata. Tanda baca, angka dan simbol dibuang.",
        effect: "Dokumen menjadi daftar kata yang bisa dihitung."
    },
    {
        key: "stopword_removal", label: "Stopword Removal",
        what: "Kata umum seperti the, of, and dibuang.",
        effect: "Jumlah kata berkurang drastis, tersisa kata yang bermakna."
    },
    {
        key: "stemming", label: "Stemming",
        what: "Kata diubah ke bentuk dasar (Porter Stemmer).",
        effect: "Variasi kata digabung, sehingga jumlah kata unik (vocabulary) paling banyak berkurang di sini."
    },
    {
        key: "normalization", label: "Normalisasi",
        what: "Token 1 huruf sisa simbol/rumus dibuang.",
        effect: "Hasil akhir ini yang disimpan di indeks pencarian."
    }
];

let requestedDoc = null;


export async function loadDataset() {
    try {
        const data = await getSummary();
        renderSummary(data);
        $("#doc-select").innerHTML = data.documents.map((d) =>
            `<option value="${d.id}">[${d.id}] ${escapeHtml(d.title)}</option>`).join("");
        // Dokumen bisa sudah diminta dari tab Pencarian sebelum daftar selesai dimuat
        if (requestedDoc === null) showDocument(0);
        else $("#doc-select").value = requestedDoc;
    } catch (error) {
        $("#dataset-info").innerHTML = errorBox(error);
    }
}

export function initDataset() {
    $("#doc-select").addEventListener("change", (event) => showDocument(Number(event.target.value)));
}

function renderSummary(data) {
    const first = data.stages[0];
    const last = data.stages[data.stages.length - 1];
    const tokenDrop = 1 - last.avg_tokens / first.avg_tokens;
    const vocabDrop = 1 - last.vocabulary / first.vocabulary;

    $("#dataset-info").innerHTML = `
        <div class="stats">
            <div class="stat"><div class="value">${data.total_documents}</div><div class="name">Dokumen paper</div></div>
            <div class="stat"><div class="value">${data.year_min}–${data.year_max}</div><div class="name">Tahun terbit</div></div>
            <div class="stat"><div class="value">${data.unique_venues}</div><div class="name">Jurnal/konferensi berbeda</div></div>
            <div class="stat"><div class="value">${data.avg_words}</div><div class="name">Rata-rata kata per dokumen</div></div>
        </div>

        <div class="card">
            <h2>Tentang Dataset</h2>
            <p>${escapeHtml(data.source)}</p>
            <p class="muted small">Yang dicari = judul + abstrak setiap paper. Kolom asli:
                ${data.columns.map((c) => `<code>${escapeHtml(c)}</code>`).join(" ")}.
                Document ID = nomor baris (0–${data.total_documents - 1}).</p>
        </div>

        <div class="card">
            <h2>Apa yang Dilakukan Preprocessing?</h2>
            <p>Sebelum bisa dicari, teks dibersihkan dalam beberapa tahap. Secara keseluruhan, preprocessing
               <b>mengurangi ${Math.round(tokenDrop * 100)}% kata</b> per dokumen dan
               <b>${Math.round(vocabDrop * 100)}% kata unik</b>, sehingga pencarian lebih fokus pada kata yang bermakna.</p>
            <div class="chart-grid">
                <div>
                    <h3>Rata-rata kata per dokumen</h3>
                    ${barChart({
                        rows: data.stages.map((s, i) => ({ label: STAGES[i].label, values: [s.avg_tokens] })),
                        series: [{ ...SERIES.vsm, name: "Kata" }],
                        max: first.avg_tokens,
                        format: (v) => v.toLocaleString("id-ID")
                    })}
                </div>
                <div>
                    <h3>Kata unik di seluruh koleksi</h3>
                    ${barChart({
                        rows: data.stages.map((s, i) => ({ label: STAGES[i].label, values: [s.vocabulary] })),
                        series: [{ ...SERIES.vsm, name: "Kata unik" }],
                        max: first.vocabulary,
                        format: (v) => v.toLocaleString("id-ID")
                    })}
                </div>
            </div>
            <div class="table-wrap"><table>
                <caption class="sr-only">Pengaruh setiap tahap preprocessing</caption>
                <thead><tr><th>Tahap</th><th>Yang dilakukan</th>
                    <th class="num">Rata-rata kata / dokumen</th><th class="num">Kata unik di koleksi</th></tr></thead>
                <tbody>
                ${data.stages.map((s, i) => `
                <tr><td><b>${i + 2}. ${STAGES[i].label}</b></td><td>${STAGES[i].what}</td>
                    <td class="num">${s.avg_tokens}</td><td class="num">${s.vocabulary.toLocaleString("id-ID")}</td></tr>`).join("")}
                </tbody>
            </table></div>
            <p class="muted small">Tahap 1 (case folding: semua huruf menjadi kecil) tidak mengubah jumlah kata.</p>
        </div>`;
}

export async function showDocument(docId) {
    requestedDoc = docId;
    $("#doc-select").value = docId;
    $("#doc-steps").innerHTML = loading();

    try {
        const d = await api(`/api/document/${docId}`);
        if (requestedDoc !== docId) return;  // pengguna sudah memilih dokumen lain
        renderDocument(d);
    } catch (error) {
        $("#doc-steps").innerHTML = errorBox(error);
    }
}

function renderDocument(d) {
    const stopwords = d.trace.filter((t) => t.removed === "stopword").length;
    const shortTokens = d.trace.filter((t) => t.removed === "normalization").length;
    const changed = d.trace.filter((t) => t.term && t.term !== t.word).length;

    const stageCounts = [d.tokenization, d.stopword_removal, d.stemming, d.normalization]
        .map((list) => list.length);

    $("#doc-steps").innerHTML = `
        <p class="meta">${escapeHtml(d.authors.join(", "))} · ${escapeHtml(d.venue)} · ${d.year} · ${d.n_citation} sitasi</p>

        <h3>Sebelum diproses</h3>
        <p class="original">${escapeHtml(d.original)}</p>

        <h3>Setelah diproses</h3>
        <div class="stats compact">
            <div class="stat"><div class="value">${stageCounts[0]}</div><div class="name">kata awal</div></div>
            <div class="stat"><div class="value">−${stopwords}</div><div class="name">kata umum dibuang ${tip("stopword")}</div></div>
            <div class="stat"><div class="value">${changed}</div><div class="name">kata diubah ke bentuk dasar ${tip("stem")}</div></div>
            <div class="stat"><div class="value">${stageCounts[3]}</div><div class="name">term disimpan di indeks (${new Set(d.normalization).size} unik)</div></div>
        </div>
        ${traceLegend}
        <p class="trace">${d.trace.map(traceWord).join(" ")}</p>
        ${shortTokens ? `<p class="muted small">${shortTokens} token 1 huruf dibuang saat normalisasi.</p>` : ""}

        <details class="stage-details">
            <summary>Lihat hasil lengkap setiap tahap</summary>
            <div class="step">
                <h4>1. Case Folding</h4>
                <p>${escapeHtml(d.case_folding)}</p>
            </div>
            ${STAGES.map((s, i) => `
            <div class="step">
                <h4>${i + 2}. ${s.label} <span class="badge info">${stageCounts[i]} token</span></h4>
                <p class="muted small">${s.what} ${s.effect}</p>
                ${chips(d[s.key], i >= 2 ? "" : "plain")}
            </div>`).join("")}
        </details>`;
}
