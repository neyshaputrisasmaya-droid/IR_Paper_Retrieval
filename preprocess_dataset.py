"""
Pipeline preprocessing dataset (Ketentuan UAS E.1 poin 5 dan E.2).

Membaca teks asli (judul + abstrak), menjalankan seluruh tahapan
preprocessing, lalu menulis ulang kolom hasil setiap tahap ke
dataset/prepared_dataset.csv. Kolom `normalization` dipakai sistem
sebagai indeks Boolean dan VSM.

Cara pakai:
    python preprocess_dataset.py            # proses + contoh dokumen ID 0
    python preprocess_dataset.py 0 9 43     # proses + contoh beberapa dokumen
"""

import os
import sys

import pandas as pd

from backend.preprocessing import preprocess_steps


DATASET_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "dataset",
    "prepared_dataset.csv"
)


STAGES = [
    "case_folding",
    "tokenization",
    "stopword_removal",
    "stemming",
    "normalization",
]


def process_dataset(df):
    """Menjalankan seluruh tahap preprocessing pada setiap dokumen."""

    df = df.copy()
    df["document_text"] = df["title"] + " " + df["abstract"]
    df["text_length"] = df["document_text"].str.split().str.len()

    steps = [preprocess_steps(text) for text in df["document_text"]]

    for stage in STAGES:
        values = [step[stage] for step in steps]
        # List disimpan sebagai teks Python agar bisa dibaca ast.literal_eval
        df[stage] = values if stage == "case_folding" else [str(v) for v in values]

    df["token_count"] = [len(s["tokenization"]) for s in steps]
    df["token_count_after_stopword"] = [len(s["stopword_removal"]) for s in steps]
    df["token_count_after_stemming"] = [len(s["stemming"]) for s in steps]
    df["token_count_after_normalization"] = [len(s["normalization"]) for s in steps]

    return df, steps


def show_document(df, steps, doc_id):
    row = df.loc[doc_id]
    step = steps[doc_id]

    print("=" * 70)
    print(f"DOKUMEN ID {doc_id}: {row['title']}")
    print("=" * 70)
    print("\n[SEBELUM] Teks asli:")
    print(row["document_text"])

    for number, stage in enumerate(STAGES, start=1):
        value = step[stage]
        count = "" if isinstance(value, str) else f" ({len(value)} token)"
        print(f"\n[{number}] {stage.replace('_', ' ').title()}{count}:")
        print(value)

    print("\n[RINGKASAN]")
    print(f"  Token awal                : {row['token_count']}")
    print(f"  Setelah stopword removal  : {row['token_count_after_stopword']}")
    print(f"  Setelah normalisasi       : {row['token_count_after_normalization']}")
    print(f"  Term unik (akhir)         : {len(set(step['normalization']))}")
    print()


def main():
    df, steps = process_dataset(pd.read_csv(DATASET_PATH))

    for doc_id in [int(arg) for arg in sys.argv[1:]] or [0]:
        if doc_id not in df.index:
            print(f"Dokumen ID {doc_id} tidak ada (0-{len(df) - 1}).")
            continue
        show_document(df, steps, doc_id)

    vocab = {
        stage: len({t for s in steps for t in s[stage]})
        for stage in STAGES[1:]
    }

    print("=" * 70)
    print(f"STATISTIK KOLEKSI ({len(df)} dokumen)")
    print("=" * 70)
    print(f"  Rata-rata token awal              : {df['token_count'].mean():.1f}")
    print(f"  Rata-rata token setelah stopword  : {df['token_count_after_stopword'].mean():.1f}")
    print(f"  Rata-rata token setelah normalisasi: {df['token_count_after_normalization'].mean():.1f}")
    for stage, size in vocab.items():
        print(f"  Vocabulary setelah {stage:<17}: {size}")

    df.to_csv(DATASET_PATH, index=False)
    print(f"\nDataset diperbarui: {DATASET_PATH}")


if __name__ == "__main__":
    main()
