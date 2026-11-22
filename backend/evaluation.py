"""
Evaluasi Information Retrieval (Ketentuan UAS E.5).

Metrik: Precision@5, Precision@10, Recall@10, Average Precision (MAP)
dan Reciprocal Rank (MRR) untuk VSM; Precision, Recall dan F1 untuk
Boolean Retrieval (hasil Boolean tidak berperingkat).

Jalankan di terminal: python -m backend.evaluation
"""

import json
import os

from backend.boolean_retrieval import boolean_search
from backend.dataset import df
from backend.vector_space import rank_documents


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUERIES_PATH = os.path.join(BASE_DIR, "evaluation", "queries.json")


# ==========================================
# 1. METRIK
# ==========================================

def precision_at_k(ranked_ids, relevant, k):
    return len(set(ranked_ids[:k]) & relevant) / k


def recall_at_k(ranked_ids, relevant, k, total=None):
    """`total` = jumlah relevan di koleksi (default: len(relevant))."""
    return len(set(ranked_ids[:k]) & relevant) / (total or len(relevant))


def average_precision(ranked_ids, relevant, total=None):
    """Rata-rata precision pada setiap posisi dokumen relevan ditemukan."""
    hits, precision_sum = 0, 0.0
    for position, doc_id in enumerate(ranked_ids, start=1):
        if doc_id in relevant:
            hits += 1
            precision_sum += hits / position
    denominator = total or len(relevant)
    return precision_sum / denominator if denominator else 0.0


def reciprocal_rank(ranked_ids, relevant):
    for position, doc_id in enumerate(ranked_ids, start=1):
        if doc_id in relevant:
            return 1 / position
    return 0.0


def set_metrics(retrieved, relevant):
    """Precision, Recall, F1 untuk hasil tanpa peringkat (Boolean)."""
    found = len(retrieved & relevant)
    precision = found / len(retrieved) if retrieved else 0.0
    recall = found / len(relevant)
    f1 = (2 * precision * recall / (precision + recall)
          if precision + recall else 0.0)
    return precision, recall, f1


def judged_metrics(ranked_ids, relevant, total_relevant=None, ks=(5, 10)):
    """
    Metrik untuk hasil yang dinilai langsung oleh pengguna (query apa saja).
    `total_relevant` = jumlah dokumen relevan di seluruh koleksi; jika
    tidak diketahui, Recall tidak dihitung dan AP dibagi jumlah yang ditandai.
    """

    relevant = set(relevant)
    # Jumlah relevan di koleksi tidak mungkin lebih kecil dari yang ditandai
    total = max(total_relevant or 0, len(relevant))
    first = next(
        (i for i, doc_id in enumerate(ranked_ids, start=1) if doc_id in relevant),
        None
    )

    return {
        "hits": {k: len(set(ranked_ids[:k]) & relevant) for k in ks},
        "precision": {k: precision_at_k(ranked_ids, relevant, k) for k in ks},
        "recall": (
            {k: recall_at_k(ranked_ids, relevant, k, total) for k in ks}
            if total_relevant else None
        ),
        "ap": average_precision(ranked_ids, relevant, total),
        "ap_denominator": total,
        "rr": reciprocal_rank(ranked_ids, relevant),
        "first_relevant_rank": first,
    }


# ==========================================
# 2. EVALUASI SELURUH QUERY
# ==========================================

def load_queries():
    with open(QUERIES_PATH, encoding="utf-8") as file:
        return json.load(file)


def save_queries(data):
    # Tulis ke file sementara dulu agar file asli tidak rusak jika gagal di tengah
    temp_path = QUERIES_PATH + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
    os.replace(temp_path, QUERIES_PATH)


def validate_query(item):
    """Memeriksa input query uji dari pengguna. ValueError jika tidak valid."""

    query = str(item.get("query", "")).strip()
    boolean_query = str(item.get("boolean_query", "")).strip()
    information_need = str(item.get("information_need", "")).strip()

    if not query:
        raise ValueError("Query VSM tidak boleh kosong.")
    if not boolean_query:
        raise ValueError("Query Boolean tidak boleh kosong.")

    # Memastikan query Boolean bisa diproses (melempar ValueError jika salah)
    boolean_search(boolean_query)

    try:
        relevant = sorted({int(doc_id) for doc_id in item.get("relevant", [])})
    except (TypeError, ValueError):
        raise ValueError("Document ID relevan harus berupa angka.")

    if not relevant:
        raise ValueError("Minimal satu dokumen relevan harus dipilih.")

    invalid = [doc_id for doc_id in relevant if doc_id not in df.index]
    if invalid:
        raise ValueError(
            f"Document ID tidak ada di dataset: {invalid} "
            f"(rentang 0-{len(df) - 1})."
        )

    return {
        "query": query,
        "boolean_query": boolean_query,
        "information_need": information_need,
        "relevant": relevant,
    }


def add_query(item):
    data = load_queries()
    numbers = [
        int(q["id"][1:]) for q in data["queries"]
        if q["id"][1:].isdigit()
    ]
    new_item = {"id": f"Q{max(numbers, default=0) + 1}", **validate_query(item)}
    data["queries"].append(new_item)
    save_queries(data)
    return new_item


def update_query(query_id, item):
    data = load_queries()
    for index, existing in enumerate(data["queries"]):
        if existing["id"] == query_id:
            data["queries"][index] = {"id": query_id, **validate_query(item)}
            save_queries(data)
            return data["queries"][index]
    raise KeyError(query_id)


def delete_query(query_id):
    data = load_queries()
    remaining = [q for q in data["queries"] if q["id"] != query_id]
    if len(remaining) == len(data["queries"]):
        raise KeyError(query_id)
    data["queries"] = remaining
    save_queries(data)


def doc_list(doc_ids, relevant):
    return [
        {
            "doc_id": int(doc_id),
            "title": df.loc[doc_id, "title"],
            "relevant": doc_id in relevant,
        }
        for doc_id in doc_ids
    ]


def evaluate_query(item):
    relevant = set(item["relevant"])

    # VSM: hanya dokumen dengan skor > 0 yang dianggap ditemukan
    _, ranked = rank_documents(item["query"])
    ranked_ids = [doc_id for doc_id, score in ranked if score > 0]

    # Boolean: himpunan dokumen yang memenuhi query
    boolean_ids = boolean_search(item["boolean_query"])
    b_precision, b_recall, b_f1 = set_metrics(boolean_ids, relevant)

    return {
        "id": item["id"],
        "query": item["query"],
        "boolean_query": item["boolean_query"],
        "information_need": item["information_need"],
        "relevant_count": len(relevant),
        "vsm": {
            "p5": precision_at_k(ranked_ids, relevant, 5),
            "p10": precision_at_k(ranked_ids, relevant, 10),
            "r10": recall_at_k(ranked_ids, relevant, 10),
            "ap": average_precision(ranked_ids, relevant),
            "rr": reciprocal_rank(ranked_ids, relevant),
            "top10": doc_list(ranked_ids[:10], relevant),
            "missed": doc_list(sorted(relevant - set(ranked_ids[:10])), relevant),
        },
        "boolean": {
            "retrieved_count": len(boolean_ids),
            "precision": b_precision,
            "recall": b_recall,
            "f1": b_f1,
            "retrieved": doc_list(sorted(boolean_ids), relevant),
            "missed": doc_list(sorted(relevant - boolean_ids), relevant),
        },
    }


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def evaluate_all():
    data = load_queries()
    results = [evaluate_query(item) for item in data["queries"]]

    summary = {
        "vsm": {
            key: mean(r["vsm"][key] for r in results)
            for key in ("p5", "p10", "r10", "ap", "rr")
        },
        "boolean": {
            key: mean(r["boolean"][key] for r in results)
            for key in ("precision", "recall", "f1")
        },
    }
    # MAP = rata-rata AP, MRR = rata-rata reciprocal rank
    summary["vsm"]["map"] = summary["vsm"].pop("ap")
    summary["vsm"]["mrr"] = summary["vsm"].pop("rr")

    return {
        "criteria": data["criteria"],
        "queries": results,
        "summary": summary,
    }


# ==========================================
# 3. LAPORAN TERMINAL
# ==========================================

if __name__ == "__main__":
    report = evaluate_all()

    print(f"{'ID':<4} {'Query':<42} {'Rel':>3} | {'P@5':>5} {'P@10':>5} "
          f"{'R@10':>5} {'AP':>5} | {'B-Ret':>5} {'B-P':>5} {'B-R':>5}")
    print("-" * 100)
    for r in report["queries"]:
        v, b = r["vsm"], r["boolean"]
        print(f"{r['id']:<4} {r['query'][:42]:<42} {r['relevant_count']:>3} | "
              f"{v['p5']:>5.2f} {v['p10']:>5.2f} {v['r10']:>5.2f} {v['ap']:>5.2f} | "
              f"{b['retrieved_count']:>5} {b['precision']:>5.2f} {b['recall']:>5.2f}")

    s = report["summary"]
    print("-" * 100)
    print("VSM     : P@5={p5:.3f}  P@10={p10:.3f}  R@10={r10:.3f}  "
          "MAP={map:.3f}  MRR={mrr:.3f}".format(**s["vsm"]))
    print("Boolean : Precision={precision:.3f}  Recall={recall:.3f}  "
          "F1={f1:.3f}".format(**s["boolean"]))
