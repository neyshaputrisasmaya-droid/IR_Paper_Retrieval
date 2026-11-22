
import re
from collections import defaultdict

from backend import dataset
from backend.preprocessing import matching_words, preprocess_query


# ==========================================
# 1. HIMPUNAN TERM SETIAP DOKUMEN
# ==========================================

documents = {
    doc_id: set(tokens)
    for doc_id, tokens in dataset.documents.items()
}


# ==========================================
# 2. MEMBUAT INVERTED INDEX
# ==========================================

inverted_index = defaultdict(set)

for doc_id, tokens in documents.items():
    for term in tokens:
        inverted_index[term].add(doc_id)

all_documents = set(documents.keys())

OPERATORS = ("AND", "OR", "NOT")


# ==========================================
# 3. OPERASI BOOLEAN
# ==========================================

def boolean_and(set1, set2):
    return set1.intersection(set2)


def boolean_or(set1, set2):
    return set1.union(set2)


def boolean_not(documents_set):
    return all_documents.difference(documents_set)


# ==========================================
# 4. TOKENIZATION QUERY BOOLEAN
# ==========================================

def tokenize_boolean_query(query):
    tokens = re.findall(r"\(|\)|[A-Za-z]+", query)

    processed_tokens = []

    for token in tokens:
        upper_token = token.upper()

        if upper_token in OPERATORS:
            processed_tokens.append(upper_token)

        elif token in ("(", ")"):
            processed_tokens.append(token)

        else:
            processed = preprocess_query(token)

            if processed:
                processed_tokens.extend(processed)

    return processed_tokens


# ==========================================
# 5. BOOLEAN SEARCH
# ==========================================

def boolean_search(query):

    tokens = tokenize_boolean_query(query)

    if not tokens:
        return set()

    position = 0

    def parse_expression():
        return parse_or()

    def parse_or():
        nonlocal position

        result = parse_and()

        while position < len(tokens) and tokens[position] == "OR":
            position += 1
            right = parse_and()
            result = boolean_or(result, right)

        return result

    def parse_and():
        nonlocal position

        result = parse_not()

        # Dua term berdampingan tanpa operator dianggap AND
        # ("image retrieval" sama dengan "image AND retrieval")
        while position < len(tokens) and tokens[position] not in ("OR", ")"):
            if tokens[position] == "AND":
                position += 1
            right = parse_not()
            result = boolean_and(result, right)

        return result

    def parse_not():
        nonlocal position

        if position < len(tokens) and tokens[position] == "NOT":
            position += 1
            return boolean_not(parse_not())

        return parse_term()

    def parse_term():
        nonlocal position

        if position >= len(tokens):
            raise ValueError("Query tidak lengkap.")

        token = tokens[position]

        if token == "(":
            position += 1
            result = parse_expression()

            if position >= len(tokens) or tokens[position] != ")":
                raise ValueError("Kurung tutup tidak ditemukan.")

            position += 1
            return result

        if token in ("AND", "OR", "NOT", ")"):
            raise ValueError("Format query Boolean tidak valid.")

        position += 1

        return inverted_index.get(token, set())

    result = parse_expression()

    if position != len(tokens):
        raise ValueError("Format query Boolean tidak valid.")

    return result


# ==========================================
# 6. MENAMPILKAN HASIL PENCARIAN
# ==========================================

def boolean_query_terms(query):
    """Term (hasil preprocessing) pada query Boolean, tanpa operator."""
    return [
        token for token in tokenize_boolean_query(query)
        if token not in OPERATORS + ("(", ")")
    ]


def strip_operators(query):
    """Query tanpa operator dan kurung, untuk menampilkan preprocessing-nya."""
    return re.sub(r"\b(and|or|not)\b|[()]", " ", query, flags=re.IGNORECASE)


def display_boolean_results(result_ids, query_terms=()):
    """Boolean tidak memiliki skor, dokumen diurutkan berdasarkan Document ID."""

    results = []

    for doc_id in sorted(result_ids):
        matched = sorted(set(query_terms) & documents[doc_id])
        info = dataset.document_info(doc_id)

        results.append({
            **info,
            "Matched Terms": matched,
            "Matched Words": matching_words(
                f"{info['Title']} {info['Abstract']}", matched
            ),
        })

    return results
