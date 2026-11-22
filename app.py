from flask import Flask, jsonify, render_template, request

from backend import dataset
from backend.boolean_retrieval import (
    boolean_query_terms,
    boolean_search,
    display_boolean_results,
    strip_operators,
)
from backend.evaluation import (
    add_query,
    delete_query,
    evaluate_all,
    judged_metrics,
    load_queries,
    update_query,
)
from backend.preprocessing import token_trace
from backend.vector_space import explain_vsm, rank_documents, top_k_results


app = Flask(__name__)

TOP_K_OPTIONS = (5, 10)


def error(message, status=400):
    return jsonify({"success": False, "message": message}), status


def request_json():
    return request.get_json(silent=True) or {}


# Input tidak valid dari pengguna -> 400 dengan pesan yang jelas
@app.errorhandler(ValueError)
def handle_value_error(exc):
    return error(str(exc))


@app.errorhandler(500)
def handle_server_error(exc):
    return error("Terjadi kesalahan pada server.", 500)


# ==========================================
# HALAMAN UTAMA
# ==========================================

@app.route("/")
def index():
    return render_template("index.html")


# ==========================================
# API PENCARIAN
# ==========================================

@app.route("/search", methods=["POST"])
def search():

    data = request_json()
    query = str(data.get("query", "")).strip()
    method = data.get("method", "vsm")

    try:
        top_k = int(data.get("top_k", 5))
    except (TypeError, ValueError):
        top_k = None

    if not query:
        return error("Query pencarian tidak boleh kosong.")

    if top_k not in TOP_K_OPTIONS:
        return error("Jumlah hasil hanya boleh Top-5 atau Top-10.")

    if method == "boolean":
        result_ids = boolean_search(query)
        results = display_boolean_results(result_ids, boolean_query_terms(query))
        total_matches = len(results)
        results = results[:top_k]
        trace = token_trace(strip_operators(query))

    elif method == "vsm":
        query_vec, ranked = rank_documents(query)
        results = top_k_results(query_vec, ranked, top_k)
        total_matches = sum(score > 0 for _, score in ranked)
        trace = token_trace(query)

    else:
        return error("Metode pencarian tidak valid.")

    return jsonify({
        "success": True,
        "query": query,
        "method": method,
        "trace": trace,
        "processed_query": [t["term"] for t in trace if "term" in t],
        "total_matches": total_matches,
        "total_results": len(results),
        "results": results,
    })


# ==========================================
# API DATASET & PREPROCESSING
# ==========================================

@app.route("/api/dataset")
def dataset_info():
    return jsonify({"success": True, **dataset.summary()})


@app.route("/api/document/<int:doc_id>")
def document_detail(doc_id):
    if doc_id not in dataset.df.index:
        return error("Dokumen tidak ditemukan.", 404)
    return jsonify({"success": True, **dataset.document_detail(doc_id)})


# ==========================================
# API PERHITUNGAN MANUAL VSM
# ==========================================

@app.route("/api/explain", methods=["POST"])
def explain():
    query = str(request_json().get("query", "")).strip()
    if not query:
        return error("Query tidak boleh kosong.")
    return jsonify({"success": True, **explain_vsm(query, top_n=3)})


# ==========================================
# API EVALUASI
# ==========================================

@app.route("/api/evaluation")
def evaluation():
    return jsonify({"success": True, **evaluate_all()})


@app.route("/api/metrics", methods=["POST"])
def metrics():
    """Metrik untuk hasil pencarian yang dinilai langsung oleh pengguna."""

    data = request_json()

    try:
        ranked = [int(doc_id) for doc_id in data.get("ranked", [])]
        relevant = [int(doc_id) for doc_id in data.get("relevant", [])]
        total = int(data.get("total_relevant") or 0)
        ks = [k for k in TOP_K_OPTIONS if k <= max(len(ranked), 5)]
    except (TypeError, ValueError):
        return error("Data penilaian tidak valid.")

    if not 0 <= total <= len(dataset.df):
        return error(f"Jumlah dokumen relevan harus 0-{len(dataset.df)}.")

    return jsonify({
        "success": True,
        **judged_metrics(ranked, relevant, total or None, ks),
    })


# ==========================================
# API KELOLA QUERY UJI
# ==========================================

@app.route("/api/queries", methods=["GET"])
def list_queries():
    return jsonify({"success": True, **load_queries()})


@app.route("/api/queries", methods=["POST"])
def create_query():
    return jsonify({"success": True, "query": add_query(request_json())})


@app.route("/api/queries/<query_id>", methods=["PUT"])
def edit_query(query_id):
    try:
        item = update_query(query_id, request_json())
    except KeyError:
        return error(f"Query uji {query_id} tidak ditemukan.", 404)
    return jsonify({"success": True, "query": item})


@app.route("/api/queries/<query_id>", methods=["DELETE"])
def remove_query(query_id):
    try:
        delete_query(query_id)
    except KeyError:
        return error(f"Query uji {query_id} tidak ditemukan.", 404)
    return jsonify({"success": True})


# ==========================================
# MENJALANKAN APLIKASI
# ==========================================

if __name__ == "__main__":
    app.run(debug=True)
