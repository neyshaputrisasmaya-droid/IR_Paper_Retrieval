"""
Memuat dataset satu kali dan menyediakannya untuk seluruh modul
(Boolean, VSM, evaluasi, dan API).
"""

import ast
import os
from functools import cache

import pandas as pd

from backend.preprocessing import token_trace


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "prepared_dataset.csv")

SOURCE = (
    "Subset 100 dokumen dari DBLP Citation Network Dataset (AMiner), "
    "berisi metadata paper ilmiah ilmu komputer: judul, abstrak, penulis, "
    "venue, tahun, jumlah sitasi, dan referensi."
)

ORIGINAL_COLUMNS = [
    "id", "title", "abstract", "authors",
    "venue", "year", "n_citation", "references",
]

STAGE_COLUMNS = [
    "tokenization",
    "stopword_removal",
    "stemming",
    "normalization",
]


df = pd.read_csv(DATASET_PATH)

# Kolom list disimpan sebagai teks di CSV, di-parse sekali saat start
stage_tokens = {
    column: df[column].apply(ast.literal_eval)
    for column in STAGE_COLUMNS
}

# Token akhir setiap dokumen: dasar indeks Boolean dan VSM
documents = stage_tokens["normalization"].to_dict()


def document_info(doc_id):
    """Metadata ringkas untuk daftar hasil pencarian."""
    row = df.loc[doc_id]
    return {
        "Document ID": int(doc_id),
        "Title": row["title"],
        "Year": int(row["year"]),
        "Venue": row["venue"],
        "Abstract": row["abstract"],
    }


@cache
def summary():
    """Statistik koleksi dan pengaruh tiap tahap preprocessing."""
    return {
        "source": SOURCE,
        "total_documents": len(df),
        "year_min": int(df["year"].min()),
        "year_max": int(df["year"].max()),
        "unique_venues": int(df["venue"].nunique()),
        "avg_words": round(float(df["text_length"].mean()), 1),
        "columns": ORIGINAL_COLUMNS,
        "stages": [
            {
                "stage": column,
                "avg_tokens": round(float(tokens.str.len().mean()), 1),
                "vocabulary": len({t for doc in tokens for t in doc}),
            }
            for column, tokens in stage_tokens.items()
        ],
        "documents": [
            {"id": int(i), "title": title}
            for i, title in df["title"].items()
        ],
    }


def document_detail(doc_id):
    """Dokumen lengkap beserta hasil setiap tahap preprocessing."""
    row = df.loc[doc_id]
    return {
        "id": int(doc_id),
        "title": row["title"],
        "authors": ast.literal_eval(row["authors"]),
        "venue": row["venue"],
        "year": int(row["year"]),
        "n_citation": int(row["n_citation"]),
        "original": row["document_text"],
        "case_folding": row["case_folding"],
        "trace": token_trace(row["document_text"]),
        **{column: stage_tokens[column][doc_id] for column in STAGE_COLUMNS},
    }
