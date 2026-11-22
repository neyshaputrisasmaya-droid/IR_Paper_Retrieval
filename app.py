
from flask import Flask, render_template, request, jsonify

from backend.boolean_retrieval import (
    boolean_search,
    display_boolean_results
)

from backend.vector_space import vsm_search


app = Flask(__name__)


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

    try:
        data = request.get_json(silent=True) or {}
        query = str(data.get("query", "")).strip()
        method = data.get("method", "vsm")
        top_k = int(data.get("top_k", 5))

        if not query:
            return jsonify({
                "success": False,
                "message": "Query pencarian tidak boleh kosong."
            }), 400

        if top_k not in (5, 10):
            return jsonify({
                "success": False,
                "message": "Jumlah hasil hanya boleh Top-5 atau Top-10."
            }), 400

        # Boolean Retrieval
        if method == "boolean":

            result_ids = boolean_search(query)
            results_df = display_boolean_results(result_ids)
            results_df = results_df.head(top_k)
            results = results_df.to_dict(orient="records")

        # Vector Space Model
        elif method == "vsm":

            results_df = vsm_search(query, top_k=top_k)

            results = results_df.to_dict(orient="records")

        else:
            return jsonify({
                "success": False,
                "message": "Metode pencarian tidak valid."
            }), 400

        return jsonify({
            "success": True,
            "query": query,
            "method": method,
            "total_results": len(results),
            "results": results
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    except Exception as error:
        return jsonify({
            "success": False,
            "message": "Terjadi kesalahan pada server."
        }), 500


# ==========================================
# MENJALANKAN APLIKASI
# ==========================================

if __name__ == "__main__":
    app.run(debug=True)
