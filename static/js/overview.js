// Halaman Ringkasan: angka kunci, grafik, dan pencarian cepat.

import { $, api, errorBox, fmt, getSummary, openTab, pct, tip } from "./common.js";
import { barChart, modelComparisonChart, SERIES } from "./charts.js";

const kpi = (value, name, sentence, key) => `
    <div class="stat">
        <div class="value">${value}</div>
        <div class="name">${name}${key ? ` ${tip(key)}` : ""}</div>
        <div class="explain">${sentence}</div>
    </div>`;

export async function loadOverview() {
    try {
        const [dataset, evaluation] = await Promise.all([getSummary(), api("/api/evaluation")]);
        render(dataset, evaluation);
    } catch (error) {
        $("#overview-content").innerHTML = errorBox(error);
    }
}

function render(dataset, evaluation) {
    const s = evaluation.summary;
    const q = evaluation.queries;
    const vocab = dataset.stages[dataset.stages.length - 1].vocabulary;

    $("#overview-kpis").innerHTML = `
        <div class="stats">
            ${kpi(dataset.total_documents, "Dokumen paper", `${dataset.year_min}–${dataset.year_max}, ${dataset.unique_venues} jurnal/konferensi`)}
            ${kpi(vocab.toLocaleString("id-ID"), "Term unik di indeks", "kata dasar setelah preprocessing", "term")}
            ${kpi(q.length, "Query uji", "dengan kunci jawaban relevansi", "relevance")}
            ${kpi(fmt(s.vsm.p5, 2), "VSM Precision@5", `rata-rata ${fmt(s.vsm.p5 * 5, 1)} dari 5 hasil teratas relevan`, "p5")}
            ${kpi(fmt(s.vsm.map, 2), "VSM MAP", "kualitas urutan hasil (maks 1)", "map")}
        </div>`;

    $("#overview-compare").innerHTML = q.length ? `
        <p class="lead">${s.vsm.r10 > s.boolean.recall
            ? `VSM menemukan lebih banyak dokumen relevan (${pct(s.vsm.r10)} vs ${pct(s.boolean.recall)}).`
            : `Boolean menemukan dokumen relevan sebanyak atau lebih banyak dari VSM.`}
           ${s.boolean.precision > s.vsm.p10 ? "Boolean lebih jarang salah, tetapi melewatkan banyak dokumen relevan." : ""}</p>
        ${modelComparisonChart(s, fmt)}` : '<p class="muted">Belum ada query uji.</p>';

    $("#overview-p5").innerHTML = q.length ? `
        ${barChart({
            rows: q.map((r) => ({ label: `${r.id} · ${r.query}`, values: [r.vsm.p5] })),
            series: [SERIES.vsm],
            max: 1,
            format: (v) => fmt(v, 2),
            note: "Precision@5 = bagian dari 5 hasil teratas VSM yang relevan. 1,00 berarti kelima hasil relevan."
        })}` : '<p class="muted">Belum ada query uji.</p>';
}

export function initOverview() {
    $("#quick-search").addEventListener("submit", (event) => {
        event.preventDefault();
        runQuickSearch($("#quick-query").value.trim());
    });

    $("#quick-examples").addEventListener("click", (event) => {
        const button = event.target.closest("[data-q]");
        if (button) runQuickSearch(button.dataset.q);
    });

    $("#overview-links").addEventListener("click", (event) => {
        const link = event.target.closest("[data-go]");
        if (link) openTab(link.dataset.go);
    });
}

function runQuickSearch(query) {
    if (!query) return;
    openTab("search");
    $("#query").value = query;
    $("#search-form").requestSubmit();
}
