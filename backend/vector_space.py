
import math
import os
import ast
import pandas as pd

from collections import Counter

from backend.preprocessing import preprocess_query


# ==========================================
# 1. MEMUAT DATASET
# ==========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATASET_PATH = os.path.join(
    BASE_DIR,
    "dataset",
    "prepared_dataset.csv"
)

df = pd.read_csv(DATASET_PATH)

documents = {}

for index, row in df.iterrows():
    tokens = ast.literal_eval(row["normalization"])
    documents[index] = tokens


# ==========================================
# 2. MENGHITUNG TERM FREQUENCY (TF)
# ==========================================

tf_documents = {}

for doc_id, tokens in documents.items():
    tf_documents[doc_id] = Counter(tokens)


# ==========================================
# 3. MENGHITUNG DOCUMENT FREQUENCY (DF)
# ==========================================

document_frequency = Counter()

for tf in tf_documents.values():
    for term in tf:
        document_frequency[term] += 1


# ==========================================
# 4. MENGHITUNG INVERSE DOCUMENT FREQUENCY (IDF)
# ==========================================

N = len(documents)

idf = {}

for term, df_term in document_frequency.items():
    idf[term] = math.log(N / df_term)


# ==========================================
# 5. MENGHITUNG TF-IDF
# ==========================================

tfidf_documents = {}

for doc_id, tf in tf_documents.items():

    tfidf_documents[doc_id] = {}

    for term, frequency in tf.items():
        tfidf_documents[doc_id][term] = (
            frequency * idf[term]
        )


# ==========================================
# 6. COSINE SIMILARITY
# ==========================================

def cosine_similarity(vec1, vec2):

    common_terms = set(vec1.keys()) & set(vec2.keys())

    dot_product = sum(
        vec1[term] * vec2[term]
        for term in common_terms
    )

    norm1 = math.sqrt(
        sum(value ** 2 for value in vec1.values())
    )

    norm2 = math.sqrt(
        sum(value ** 2 for value in vec2.values())
    )

    if norm1 == 0 or norm2 == 0:
        return 0

    return dot_product / (norm1 * norm2)


# ==========================================
# 7. VECTOR SPACE MODEL SEARCH
# ==========================================

def vsm_search(query, top_k=10):

    # Preprocessing query
    processed_query = preprocess_query(query)

    # Menghitung TF query
    query_tf = Counter(processed_query)

    # Menghitung TF-IDF query
    query_tfidf = {}

    for term, frequency in query_tf.items():

        if term in idf:
            query_tfidf[term] = frequency * idf[term]

    # Jika tidak ada term yang cocok
    if not query_tfidf:
        return pd.DataFrame(columns=[
        "Rank",
        "Document ID",
        "Title",
        "Year",
        "Venue",
        "Abstract",
        "Similarity Score"
    ])

    # Menghitung similarity seluruh dokumen
    scores = {}

    for doc_id, doc_vector in tfidf_documents.items():

        scores[doc_id] = cosine_similarity(
            query_tfidf,
            doc_vector
        )

    # Ranking berdasarkan similarity tertinggi
    ranked = sorted(
        scores.items(),
        key=lambda x: (-x[1], x[0])
    )

    # Mengambil Top-K
    results = []

    for rank, (doc_id, score) in enumerate(
        ranked[:top_k], start=1
    ):

        row = df.loc[doc_id]

        results.append({
            "Rank": rank,
            "Document ID": doc_id,
            "Title": row["title"],
            "Year": row["year"],
            "Venue": row["venue"],
            "Abstract": row["abstract"],
            "Similarity Score": score
        })

    return pd.DataFrame(results)
