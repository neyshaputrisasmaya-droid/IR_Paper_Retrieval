
import os
import ast
import re
import pandas as pd
from collections import defaultdict

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
    documents[index] = set(tokens)


# ==========================================
# 2. MEMBUAT INVERTED INDEX
# ==========================================

inverted_index = defaultdict(set)

for doc_id, tokens in documents.items():
    for term in tokens:
        inverted_index[term].add(doc_id)

all_documents = set(documents.keys())


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

        if upper_token in ("AND", "OR", "NOT"):
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

        while position < len(tokens) and tokens[position] == "AND":
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

def display_boolean_results(result_ids):

    results = []

    for doc_id in sorted(result_ids):
        row = df.loc[doc_id]

        results.append({
            "Document ID": doc_id,
            "Title": row["title"],
            "Year": row["year"],
            "Venue": row["venue"],
            "Abstract": row["abstract"]
        })

    return pd.DataFrame(results)
