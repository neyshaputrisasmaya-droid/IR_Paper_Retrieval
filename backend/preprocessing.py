import os
import re
from functools import cache

import nltk

from nltk.corpus import stopwords
from nltk.stem import PorterStemmer

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nltk.data.path.append(os.path.join(BASE_DIR, "nltk_data"))

stemmer = PorterStemmer()

# Mengambil stopwords bahasa Inggris
# Negasi dipertahankan
stop_words = set(stopwords.words("english"))
stop_words = stop_words - {"no", "not", "nor"}

# Kalimat hak cipta penerbit, mis. "(c) 2004 Elsevier Ltd. All rights reserved."
COPYRIGHT_PATTERN = re.compile(r"©.*?all rights reserved\.?")

# Panjang minimum token setelah normalisasi
MIN_TOKEN_LENGTH = 2


# ==========================================
# TAHAPAN (dipakai bersama oleh semua fungsi di bawah)
# ==========================================

def case_fold(text):
    return text.lower()


def tokenize(folded_text):
    """Buang kalimat hak cipta penerbit (bukan isi paper), ganti karakter
    selain huruf dengan spasi, lalu pecah per kata."""
    cleaned = COPYRIGHT_PATTERN.sub(" ", folded_text)
    return re.findall(r"[a-z]+", re.sub(r"[^a-z\s]", " ", cleaned))


def is_stopword(token):
    return token in stop_words


@cache
def stem(token):
    # Porter Stemmer relatif lambat; kosakata koleksi kecil (~3 ribu kata)
    # sehingga hasilnya aman disimpan di cache
    return stemmer.stem(token)


def is_valid_term(term):
    """Normalisasi: token 1 huruf sisa pemecahan simbol/rumus
    (mis. "e.g." -> "e", "g"; "k-means" -> "k") tidak bermakna."""
    return len(term) >= MIN_TOKEN_LENGTH


# ==========================================
# PIPELINE
# ==========================================

def preprocess_steps(text):
    """
    Menjalankan seluruh tahapan preprocessing dan mengembalikan
    hasil setiap tahap (dipakai untuk dokumen maupun query):
    1. Case folding
    2. Tokenization
    3. Stopword removal
    4. Stemming
    5. Normalisasi token
    """

    case_folding = case_fold(text)
    tokenization = tokenize(case_folding)
    stopword_removal = [t for t in tokenization if not is_stopword(t)]
    stemming = [stem(t) for t in stopword_removal]
    normalization = [t for t in stemming if is_valid_term(t)]

    return {
        "case_folding": case_folding,
        "tokenization": tokenization,
        "stopword_removal": stopword_removal,
        "stemming": stemming,
        "normalization": normalization,
    }


def preprocess_query(query):
    """Preprocessing query pengguna, mengembalikan token akhir."""
    return preprocess_steps(query)["normalization"]


def token_trace(text):
    """
    Nasib setiap kata setelah tokenization, untuk ditampilkan ke pengguna:
    dibuang sebagai stopword, dibuang saat normalisasi, atau disimpan
    sebagai term hasil stemming.
    """

    trace = []

    for token in tokenize(case_fold(text)):
        if is_stopword(token):
            trace.append({"word": token, "removed": "stopword"})
            continue

        term = stem(token)

        if is_valid_term(term):
            trace.append({"word": token, "term": term})
        else:
            trace.append({"word": token, "removed": "normalization"})

    return trace


def matching_words(text, terms):
    """Kata asli di teks yang term-nya termasuk `terms` (untuk ditebalkan)."""
    terms = set(terms)
    return sorted({
        item["word"] for item in token_trace(text)
        if item.get("term") in terms
    })
