import unittest
from app import app

from backend.preprocessing import preprocess_query
from backend.boolean_retrieval import boolean_search


class TestPreprocessing(unittest.TestCase):

    def test_case_folding_and_stemming(self):
        result = preprocess_query("IMAGE RETRIEVAL")
        self.assertEqual(result, ["imag", "retriev"])

    def test_stopword_removal(self):
        result = preprocess_query("the image retrieval")
        self.assertEqual(result, ["imag", "retriev"])

    def test_preprocess_steps(self):
        from backend.preprocessing import preprocess_steps
        steps = preprocess_steps("The Retrieving of Images!")
        self.assertEqual(steps["case_folding"], "the retrieving of images!")
        self.assertEqual(steps["tokenization"], ["the", "retrieving", "of", "images"])
        self.assertEqual(steps["stopword_removal"], ["retrieving", "images"])
        self.assertEqual(steps["stemming"], ["retriev", "imag"])
        self.assertEqual(steps["normalization"], ["retriev", "imag"])

    def test_negation_preserved(self):
        result = preprocess_query("image not retrieval")
        self.assertEqual(result, ["imag", "not", "retriev"])


class TestBooleanRetrieval(unittest.TestCase):

    def test_and_operator(self):
        result = boolean_search("paper AND tool")
        self.assertEqual(
            result,
            {0, 3, 31, 89, 98}
        )

    def test_or_operator(self):
        result = boolean_search("paper OR tool")
        self.assertEqual(len(result), 56)

    def test_not_operator(self):
        result = boolean_search("NOT paper")
        self.assertEqual(len(result), 46)

    def test_parentheses(self):
        result = boolean_search("(image OR video) AND retrieval")
        self.assertEqual(result, {9, 39})

from backend.vector_space import vsm_search


class TestVectorSpaceModel(unittest.TestCase):

    def test_search_returns_results(self):
        result = vsm_search("Image Retrieval", top_k=5)

        self.assertEqual(len(result), 5)

    def test_top_k_limit(self):
        result = vsm_search("Image Retrieval", top_k=10)

        self.assertEqual(len(result), 10)

    def test_ranking_order(self):
        result = vsm_search("Image Retrieval", top_k=5)

        scores = [doc["Similarity Score"] for doc in result]

        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_expected_top_document(self):
        result = vsm_search("Image Retrieval", top_k=5)

        first_document_id = result[0]["Document ID"]

        self.assertEqual(first_document_id, 9)

class TestFlaskAPI(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()

    def test_vsm_api(self):
        response = self.client.post(
            "/search",
            json={
                "query": "Image Retrieval",
                "method": "vsm",
                "top_k": 5
            }
        )

        self.assertEqual(response.status_code, 200)

        data = response.get_json()

        self.assertTrue(data["success"])
        self.assertEqual(data["total_results"], 5)

    def test_boolean_api(self):
        response = self.client.post(
            "/search",
            json={
                "query": "image AND retrieval",
                "method": "boolean",
                "top_k": 5
            }
        )

        self.assertEqual(response.status_code, 200)

        data = response.get_json()

        self.assertTrue(data["success"])
        self.assertEqual(data["total_results"], 2)

    def test_empty_query(self):
        response = self.client.post(
            "/search",
            json={
                "query": "",
                "method": "vsm",
                "top_k": 5
            }
        )

        self.assertEqual(response.status_code, 400)

    def test_invalid_top_k(self):
        response = self.client.post(
            "/search",
            json={
                "query": "Image Retrieval",
                "method": "vsm",
                "top_k": 7
            }
        )

        self.assertEqual(response.status_code, 400)

    def test_invalid_method(self):
        response = self.client.post(
            "/search",
            json={
                "query": "Image Retrieval",
                "method": "random",
                "top_k": 5
            }
        )

        self.assertEqual(response.status_code, 400)

    def test_explain_matches_search_score(self):
        data = self.client.post("/api/explain", json={"query": "image retrieval"}).get_json()
        top = data["documents"][0]
        self.assertEqual(top["doc_id"], 9)
        self.assertAlmostEqual(
            top["dot_product"] / (top["query_norm"] * top["doc_norm"]),
            vsm_search("image retrieval", top_k=1)[0]["Similarity Score"]
        )

    def test_document_endpoint(self):
        self.assertEqual(self.client.get("/api/document/0").status_code, 200)
        self.assertEqual(self.client.get("/api/document/999").status_code, 404)

    def test_evaluation_endpoint(self):
        data = self.client.get("/api/evaluation").get_json()
        self.assertGreaterEqual(len(data["queries"]), 10)


class TestNormalizationAndDataset(unittest.TestCase):

    def test_single_letter_tokens_removed(self):
        self.assertEqual(preprocess_query("k-means e.g. clustering"), ["mean", "cluster"])

    def test_copyright_removed(self):
        self.assertEqual(
            preprocess_query("drag reduction. © 2004 Elsevier Ltd. All rights reserved."),
            ["drag", "reduct"]
        )

    def test_dataset_index_matches_preprocessing(self):
        # Kolom normalization di CSV harus sama dengan hasil preprocess_dataset.py
        import ast
        from backend.dataset import df
        for text, saved in zip(df["document_text"], df["normalization"]):
            self.assertEqual(preprocess_query(text), ast.literal_eval(saved))

    def test_boolean_implicit_and(self):
        self.assertEqual(boolean_search("image retrieval"), boolean_search("image AND retrieval"))


class TestQueryManagementAPI(unittest.TestCase):

    def setUp(self):
        # Memakai salinan queries.json agar file asli tidak berubah
        import shutil, tempfile, os
        import backend.evaluation as evaluation
        self.evaluation = evaluation
        self.original_path = evaluation.QUERIES_PATH
        self.temp_dir = tempfile.mkdtemp()
        evaluation.QUERIES_PATH = os.path.join(self.temp_dir, "queries.json")
        shutil.copy(self.original_path, evaluation.QUERIES_PATH)
        self.client = app.test_client()

    def tearDown(self):
        import shutil
        self.evaluation.QUERIES_PATH = self.original_path
        shutil.rmtree(self.temp_dir)

    def count(self):
        return len(self.client.get("/api/queries").get_json()["queries"])

    def test_add_update_delete(self):
        before = self.count()
        item = {"query": "video compression", "boolean_query": "video AND compression",
                "information_need": "Kompresi video", "relevant": [2]}

        added = self.client.post("/api/queries", json=item).get_json()["query"]
        self.assertEqual(self.count(), before + 1)

        item["relevant"] = [2, 9]
        response = self.client.put(f"/api/queries/{added['id']}", json=item)
        self.assertEqual(response.get_json()["query"]["relevant"], [2, 9])

        self.assertEqual(self.client.delete(f"/api/queries/{added['id']}").status_code, 200)
        self.assertEqual(self.count(), before)

    def test_invalid_input_rejected(self):
        bad_items = [
            {"query": "", "boolean_query": "image", "relevant": [1]},
            {"query": "image", "boolean_query": "image AND", "relevant": [1]},
            {"query": "image", "boolean_query": "image", "relevant": []},
            {"query": "image", "boolean_query": "image", "relevant": [999]},
            {"query": "image", "boolean_query": "image", "relevant": ["abc"]},
        ]
        for item in bad_items:
            self.assertEqual(self.client.post("/api/queries", json=item).status_code, 400, item)
        self.assertEqual(self.client.delete("/api/queries/Q999").status_code, 404)


class TestEvaluationMetrics(unittest.TestCase):

    def test_metrics(self):
        from backend.evaluation import (
            precision_at_k, recall_at_k, average_precision, reciprocal_rank, set_metrics
        )
        ranked = [3, 1, 7, 2, 9]
        relevant = {1, 2, 5}
        self.assertAlmostEqual(precision_at_k(ranked, relevant, 5), 2 / 5)
        self.assertAlmostEqual(recall_at_k(ranked, relevant, 5), 2 / 3)
        self.assertAlmostEqual(average_precision(ranked, relevant), (1 / 2 + 2 / 4) / 3)
        self.assertAlmostEqual(reciprocal_rank(ranked, relevant), 1 / 2)
        self.assertEqual(set_metrics({1, 3}, relevant), (0.5, 1 / 3, 0.4))

    def test_judged_metrics(self):
        from backend.evaluation import judged_metrics
        m = judged_metrics([3, 1, 7, 2, 9], [1, 2], total_relevant=4, ks=(5,))
        self.assertEqual(m["hits"][5], 2)
        self.assertAlmostEqual(m["recall"][5], 2 / 4)
        self.assertAlmostEqual(m["ap"], (1 / 2 + 2 / 4) / 4)
        self.assertEqual(m["first_relevant_rank"], 2)
        self.assertIsNone(judged_metrics([1], [1], ks=(5,))["recall"])

    def test_metrics_endpoint(self):
        client = app.test_client()
        data = client.post("/api/metrics", json={
            "ranked": [9, 39, 87, 97, 40], "relevant": [9, 39], "total_relevant": 2
        }).get_json()
        self.assertAlmostEqual(data["precision"]["5"], 0.4)
        self.assertAlmostEqual(data["recall"]["5"], 1.0)
        bad = client.post("/api/metrics", json={"ranked": ["x"], "relevant": []})
        self.assertEqual(bad.status_code, 400)


class TestTraceAndPerformance(unittest.TestCase):

    def test_token_trace(self):
        from backend.preprocessing import token_trace
        self.assertEqual(token_trace("The images, e.g. x"), [
            {"word": "the", "removed": "stopword"},
            {"word": "images", "term": "imag"},
            {"word": "e", "removed": "normalization"},
            {"word": "g", "removed": "normalization"},
            {"word": "x", "removed": "normalization"},
        ])

    def test_matched_words_in_results(self):
        top = vsm_search("image retrieval", top_k=1)[0]
        self.assertIn("image", top["Matched Words"])
        self.assertIn("retrieval", top["Matched Words"])

    def test_precomputed_norm_matches_direct_cosine(self):
        import math
        from backend.vector_space import query_vector, tfidf_documents
        q = query_vector("wireless sensor network")
        d = tfidf_documents[77]
        dot = sum(w * d.get(t, 0) for t, w in q.items())
        direct = dot / (math.sqrt(sum(w * w for w in q.values()))
                        * math.sqrt(sum(w * w for w in d.values())))
        score = next(r for r in vsm_search("wireless sensor network", 10)
                     if r["Document ID"] == 77)["Similarity Score"]
        self.assertAlmostEqual(score, direct)

    def test_search_returns_trace(self):
        data = app.test_client().post("/search", json={
            "query": "the image AND retrieval", "method": "boolean", "top_k": 5
        }).get_json()
        self.assertEqual(data["processed_query"], ["imag", "retriev"])
        self.assertEqual(data["trace"][0], {"word": "the", "removed": "stopword"})


if __name__ == "__main__":
    unittest.main()