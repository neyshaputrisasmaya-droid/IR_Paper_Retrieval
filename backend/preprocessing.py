import re
import nltk

from nltk.corpus import stopwords
from nltk.stem import PorterStemmer

# Memastikan stopwords tersedia
nltk.download("stopwords", quiet=True)

# Inisialisasi Porter Stemmer
stemmer = PorterStemmer()

# Mengambil stopwords bahasa Inggris
# Negasi dipertahankan
stop_words = set(stopwords.words("english"))
stop_words = stop_words - {"no", "not", "nor"}


def preprocess_query(query):
    """
    Melakukan preprocessing terhadap query pengguna:
    1. Case folding
    2. Tokenization
    3. Stopword removal
    4. Stemming
    5. Normalisasi token
    """

    # Case folding
    query = query.lower()

    # Menghapus karakter selain huruf dan spasi
    query = re.sub(r"[^a-z\s]", " ", query)

    # Tokenization
    tokens = re.findall(r"[a-z]+", query)

    # Stopword removal
    tokens = [
        word for word in tokens
        if word not in stop_words
    ]

    # Stemming
    tokens = [
        stemmer.stem(word)
        for word in tokens
    ]

    # Normalisasi ringan
    tokens = [
        word.strip()
        for word in tokens
        if word.strip()
    ]

    return tokens
