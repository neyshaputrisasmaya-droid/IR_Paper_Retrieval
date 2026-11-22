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

        scores = result["Similarity Score"].tolist()

        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_expected_top_document(self):
        result = vsm_search("Image Retrieval", top_k=5)

        first_document_id = result.iloc[0]["Document ID"]

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

if __name__ == "__main__":
    unittest.main()