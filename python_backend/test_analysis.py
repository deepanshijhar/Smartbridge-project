import unittest
from fastapi.testclient import TestClient
from python_backend.analysis import audio_analysis, combine_score, analyze, suggestions
from python_backend.main import app


class AnalysisTests(unittest.TestCase):
    def test_missing_audio_renormalizes_to_88(self):
        self.assertEqual(combine_score(80, 100, None), 88)

    def test_all_missing_returns_none(self):
        self.assertIsNone(combine_score(None, None, None))

    def test_known_pcm_amplitude(self):
        self.assertAlmostEqual(audio_analysis([0.01] * 2048, None)["db"], -40)
        self.assertEqual(audio_analysis([0.01] * 2048, None)["score"], 100)

    def test_silence(self):
        self.assertEqual(audio_analysis([0] * 2048, None)["db"], -100)

    def test_audio_thresholds_match_browser(self):
        for db, expected in [(-61, 55), (-60, 85), (-45, 100), (-30, 60), (-18, 30)]:
            with self.subTest(db=db):
                self.assertEqual(audio_analysis([], db)["score"], expected)

    def test_attendance_after_three_seconds(self):
        payload = dict(now=4000, t=4, tracks=[dict(id=1, firstSeen=1000, lastSeen=4000, attention=80, present=False)], samples=[], db=None, timeline=[])
        self.assertEqual(analyze(payload)["point"]["students"], 0)
        payload["now"] = 4001
        payload["tracks"][0]["lastSeen"] = 4001
        self.assertEqual(analyze(payload)["presentIds"], [1])

    def test_cumulative_confirmed_attendance(self):
        payload = dict(now=10000, t=10, tracks=[dict(id=1, firstSeen=0, lastSeen=4000, attention=80, present=True)], samples=[], db=None, timeline=[])
        self.assertEqual(analyze(payload)["point"], dict(t=10, score=50, students=1, db=None))

    def test_low_engagement_suggestion(self):
        tips = suggestions([dict(t=i, score=30, students=2, db=-40) for i in range(3)])
        self.assertEqual(tips[0]["impact"], "Re-engagement")

    def test_http_contract_and_validation(self):
        client = TestClient(app)
        payload = dict(now=4000, t=4, tracks=[dict(id=1, firstSeen=0, lastSeen=4000, attention=80, present=False)], samples=[], db=None, timeline=[])
        headers = {"X-EduSense-Client": "local-analysis"}
        self.assertEqual(client.post("/analyze", json=payload).status_code, 403)
        response = client.post("/analyze", json=payload, headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["point"]["score"], 88)
        payload["samples"] = [2]
        self.assertEqual(client.post("/analyze", json=payload, headers=headers).status_code, 422)

    def test_disallowed_origin(self):
        client = TestClient(app)
        self.assertEqual(client.post("/analyze", json=dict(now=0, t=0, tracks=[]), headers={"X-EduSense-Client": "local-analysis", "Origin": "https://untrusted.example"}).status_code, 403)


if __name__ == "__main__":
    unittest.main()