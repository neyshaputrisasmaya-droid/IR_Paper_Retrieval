// Grafik batang horizontal sederhana (HTML/CSS, tanpa library).
// Nilai selalu tertulis di ujung batang, jadi tooltip hanya pelengkap.

import { escapeHtml } from "./common.js";

/** Warna seri tetap per model (tervalidasi untuk buta warna, ΔE 29). */
export const SERIES = {
    vsm: { name: "VSM", color: "var(--series-1)" },
    boolean: { name: "Boolean", color: "var(--series-2)" }
};

/**
 * @param {object}   options
 * @param {Array}    options.rows    [{ label, values: [number, ...] }]
 * @param {Array}    options.series  [{ name, color }] — satu entri per nilai di rows
 * @param {number}   options.max     nilai skala penuh (mis. 1 untuk metrik)
 * @param {Function} options.format  pemformat angka untuk label
 * @param {string}   options.note    catatan kecil di bawah grafik (opsional)
 */
export function barChart({ rows, series, max, format = String, note = "" }) {
    const legend = series.length > 1 ? `
        <div class="chart-legend">
            ${series.map((s) => `<span><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join("")}
        </div>` : "";

    const body = rows.map((row) => `
        <div class="chart-row">
            <span class="chart-label">${escapeHtml(row.label)}</span>
            <div class="chart-bars">
                ${row.values.map((value, i) => {
                    const width = max ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
                    const text = `${series[i].name} · ${row.label}: ${format(value)}`;
                    return `
                    <div class="chart-line">
                        <div class="chart-track">
                            <span class="chart-bar" style="width:${width}%;background:${series[i].color}"
                                  tabindex="0" data-tip="${escapeHtml(text)}" aria-label="${escapeHtml(text)}"></span>
                            <span class="chart-value" style="left:${width}%">${format(value)}</span>
                        </div>
                    </div>`;
                }).join("")}
            </div>
        </div>`).join("");

    return `
        <figure class="chart">
            ${legend}
            <div class="chart-body">${body}</div>
            ${note ? `<figcaption class="chart-note">${note}</figcaption>` : ""}
        </figure>`;
}

/** Perbandingan rata-rata metrik VSM vs Boolean. */
export function modelComparisonChart(summary, fmt) {
    return barChart({
        rows: [
            { label: "Recall", values: [summary.vsm.r10, summary.boolean.recall] },
            { label: "Precision", values: [summary.vsm.p10, summary.boolean.precision] }
        ],
        series: [SERIES.vsm, SERIES.boolean],
        max: 1,
        format: (v) => fmt(v, 2),
        note: "VSM diukur pada 10 hasil teratas (R@10, P@10). Boolean diukur pada semua dokumen yang memenuhi query."
    });
}
