import math
from collections import Counter

from backend import dataset
from backend.preprocessing import matching_words, preprocess_query, token_trace


# ==========================================
# 1. TERM FREQUENCY (TF)
# ==========================================

tf_documents = {
    doc_id: Counter(tokens)
    for doc_id, tokens in dataset.documents.items()
}


# ==========================================
# 2. DOCUMENT FREQUENCY (DF)
# ==========================================

document_frequency = Counter()

for tf in tf_documents.values():
    document_frequency.update(tf.keys())


# ==========================================
# 3. INVERSE DOCUMENT FREQUENCY (IDF)
# ==========================================

N = len(tf_documents)

idf = {
    term: math.log(N / df_term)
    for term, df_term in document_frequency.items()
}


# ==========================================
# 4. TF-IDF DAN PANJANG VEKTOR DOKUMEN
# ==========================================

tfidf_documents = {
    doc_id: {term: frequency * idf[term] for term, frequency in tf.items()}
    for doc_id, tf in tf_documents.items()
}


def vector_norm(vector):
    return math.sqrt(sum(value ** 2 for value in vector.values()))


# Panjang vektor dokumen tidak bergantung pada query, dihitung sekali saja
doc_norms = {
    doc_id: vector_norm(vector)
    for doc_id, vector in tfidf_documents.items()
}


# ==========================================
# 5. COSINE SIMILARITY
# ==========================================

def dot_product(query_vec, doc_vec):
    # Cukup iterasi term query (sedikit), bukan seluruh term dokumen
    return sum(weight * doc_vec.get(term, 0) for term, weight in query_vec.items())


def cosine_similarity(query_vec, doc_id, query_norm=None):
    query_norm = query_norm or vector_norm(query_vec)
    doc_norm = doc_norms[doc_id]

    if query_norm == 0 or doc_norm == 0:
        return 0.0

    return dot_product(query_vec, tfidf_documents[doc_id]) / (query_norm * doc_norm)


# ==========================================
# 6. RANKING DAN TOP-K
# ==========================================

def query_vector(query):
    """Vektor TF-IDF query. Term yang tidak ada di koleksi diabaikan."""
    query_tf = Counter(preprocess_query(query))
    return {
        term: frequency * idf[term]
        for term, frequency in query_tf.items()
        if term in idf
    }


def rank_documents(query):
    """
    Seluruh dokumen beserta skor cosine, diurutkan dari skor tertinggi.
    Tie-breaking: skor sama diurutkan berdasarkan Document ID terkecil.
    """

    query_vec = query_vector(query)

    if not query_vec:
        return query_vec, []

    query_norm = vector_norm(query_vec)
    scores = [
        (doc_id, cosine_similarity(query_vec, doc_id, query_norm))
        for doc_id in tfidf_documents
    ]

    return query_vec, sorted(scores, key=lambda item: (-item[1], item[0]))


def top_k_results(query_vec, ranked, top_k):
    """Format Top-K dokumen untuk ditampilkan."""

    results = []

    for rank, (doc_id, score) in enumerate(ranked[:top_k], start=1):
        matched = sorted(set(query_vec) & set(tfidf_documents[doc_id]))
        info = dataset.document_info(doc_id)

        results.append({
            "Rank": rank,
            **info,
            "Similarity Score": score,
            "Matched Terms": matched,
            "Matched Words": matching_words(
                f"{info['Title']} {info['Abstract']}", matched
            ),
        })

    return results


def vsm_search(query, top_k=10):
    query_vec, ranked = rank_documents(query)
    return top_k_results(query_vec, ranked, top_k)


# ==========================================
# 7. PERHITUNGAN MANUAL (VALIDASI)
# ==========================================

def explain_vsm(query, top_n=3):
    """
    Rincian perhitungan TF, IDF, TF-IDF dan cosine similarity
    untuk query dan top-n dokumen, agar bisa dicocokkan dengan
    perhitungan manual.
    """

    query_tf = Counter(preprocess_query(query))
    query_vec, ranked = rank_documents(query)
    query_norm = vector_norm(query_vec)

    query_terms = [
        {
            "term": term,
            "tf": query_tf[term],
            "df": document_frequency.get(term, 0),
            "idf": idf.get(term),
            "weight": query_vec.get(term),
        }
        for term in query_tf
    ]

    explained = []

    for rank, (doc_id, score) in enumerate(ranked[:top_n], start=1):
        doc_vec = tfidf_documents[doc_id]

        terms = [
            {
                "term": term,
                "tf": tf_documents[doc_id].get(term, 0),
                "weight": doc_vec.get(term, 0),
                "product": weight * doc_vec.get(term, 0),
            }
            for term, weight in query_vec.items()
        ]

        explained.append({
            "rank": rank,
            "doc_id": doc_id,
            "title": dataset.df.loc[doc_id, "title"],
            "terms": terms,
            "dot_product": dot_product(query_vec, doc_vec),
            "doc_norm": doc_norms[doc_id],
            "doc_term_count": len(doc_vec),
            "query_norm": query_norm,
            "cosine": score,
        })

    return {
        "query": query,
        "trace": token_trace(query),
        "total_documents": N,
        "query_terms": query_terms,
        "documents": explained,
    }
