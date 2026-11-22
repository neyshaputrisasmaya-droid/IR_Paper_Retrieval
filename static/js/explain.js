// Tab Perhitungan VSM: rincian TF, IDF, TF-IDF dan cosine untuk validasi manual.

import { $, api, errorBox, escapeHtml, fmt, loading, pct, tip, traceWord } from "./common.js";

export function initExplain() {
    $("#explain-form").addEventListener("submit", (event) => {
        event.preventDefault();
        runExplain();
    });
}

export async function runExplain(query) {
    if (query) $("#explain-query").value = query;
    query = $("#explain-query").value.trim();
    if (!query) return;

    $("#explain-result").innerHTML = loading("Menghitung...");

    try {
        renderExplain(await api("/api/explain", { query }));
    } catch (error) {
        $("#explain-result").innerHTML = errorBox(error);
    }
}

const rarity = (df, total) =>
    df / total <= 0.05 ? "sangat jarang, sangat khas"
        : df / total <= 0.2 ? "cukup jarang"
            : "umum, kurang khas";

function renderExplain(data) {
    const known = data.query_terms.filter((t) => t.weight !== null);

    if (!known.length) {
        $("#explain-result").innerHTML =
            '<div class="card empty">Tidak ada kata dari query yang terdapat di koleksi, sehingga semua skor 0.</div>';
        return;
    }

    const N = data.total_documents;
    const queryNorm = data.documents[0]?.query_norm ?? 0;
    const rarest = known.reduce((a, b) => (b.idf > a.idf ? b : a));
    const top = data.documents[0];

    const queryCard = `
        <div class="card">
            <h2>Langkah 1 · Ubah query menjadi angka</h2>
            <div class="trace-inline">${data.trace.map(traceWord).join(" ")}</div>
            <p class="plain">Setiap kata diberi bobot. Kata yang <b>jarang</b> muncul di koleksi dianggap lebih penting.
               Di query ini, <span class="chip">${escapeHtml(rarest.term)}</span> paling berpengaruh karena hanya muncul di
               ${rarest.df} dari ${N} dokumen.</p>
            <div class="table-wrap"><table>
                <thead><tr><th>Term ${tip("term")}</th><th class="num">TF ${tip("tf")}</th><th class="num">df ${tip("df")}</th>
                    <th class="num">IDF = ln(${N}/df) ${tip("idf")}</th><th class="num">Bobot = TF × IDF ${tip("tfidf")}</th>
                    <th>Artinya</th></tr></thead>
                <tbody>
                ${data.query_terms.map((t) => t.weight === null ? `
                <tr><td><span class="chip plain">${escapeHtml(t.term)}</span></td>
                    <td colspan="5" class="muted">tidak ada di koleksi, diabaikan</td></tr>` : `
                <tr><td><span class="chip">${escapeHtml(t.term)}</span></td>
                    <td class="num">${t.tf}</td><td class="num">${t.df}</td>
                    <td class="num">ln(${N}/${t.df}) = ${fmt(t.idf)}</td>
                    <td class="num">${t.tf} × ${fmt(t.idf)} = <b>${fmt(t.weight)}</b></td>
                    <td class="small">${rarity(t.df, N)}</td></tr>`).join("")}
                </tbody>
            </table></div>
            <div class="calc">Panjang vektor query ${tip("norm")}: |q| = √(${known.map((t) => `${fmt(t.weight)}²`).join(" + ")}) = <b>${fmt(queryNorm)}</b></div>
        </div>`;

    const docCards = data.documents.map((d) => `
        <div class="card">
            <h2>Langkah 2.${d.rank} · Dokumen peringkat ${d.rank}: skor ${fmt(d.cosine, 4)} (${pct(d.cosine)} mirip)</h2>
            <p><b>[Doc ID ${d.doc_id}]</b> ${escapeHtml(d.title)}</p>
            <div class="table-wrap"><table>
                <thead><tr><th>Term</th><th class="num">Muncul di dokumen (TF)</th>
                    <th class="num">Bobot dokumen = TF × IDF</th><th class="num">Bobot query × bobot dokumen</th></tr></thead>
                <tbody>
                ${d.terms.map((t) => `
                <tr><td><span class="chip">${escapeHtml(t.term)}</span></td>
                    <td class="num">${t.tf}×</td><td class="num">${fmt(t.weight)}</td>
                    <td class="num">${fmt(t.product)}</td></tr>`).join("")}
                <tr class="total"><td colspan="3">Jumlah (dot product)</td><td class="num">${fmt(d.dot_product)}</td></tr>
                </tbody>
            </table></div>
            <div class="calc">
                |d| = √(jumlah kuadrat bobot ${d.doc_term_count} term di dokumen) = ${fmt(d.doc_norm)}<br>
                cos(q, d) ${tip("cosine")} = ${fmt(d.dot_product)} / (${fmt(d.query_norm)} × ${fmt(d.doc_norm)}) = <b>${fmt(d.cosine)}</b>
            </div>
        </div>`).join("");

    const conclusion = top ? `
        <div class="card callout-info">
            <h2>Kesimpulan</h2>
            <p>Dokumen <b>[${top.doc_id}]</b> menempati peringkat 1 karena memuat kata-kata query
               (${top.terms.filter((t) => t.tf).map((t) => `${escapeHtml(t.term)} ${t.tf}×`).join(", ")})
               dengan bobot tinggi dibanding panjang dokumennya. Dokumen yang lebih panjang tidak otomatis menang,
               karena skor dibagi panjang vektor dokumen (|d|).</p>
        </div>` : "";

    $("#explain-result").innerHTML = queryCard + docCards + conclusion;
}
