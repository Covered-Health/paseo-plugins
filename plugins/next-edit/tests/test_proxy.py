"""Run with uv run --with fastapi --with httpx python -m unittest discover -s tests -p 'test_*.py'."""
import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import httpx

spec = importlib.util.spec_from_file_location("proxy", Path(__file__).parents[1] / "server/proxy.py")
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)


class ProxyTest(unittest.TestCase):
    def test_unicode_and_splice(self):
        body = proxy.Prediction(path="a.py", text="😀x\nold\nsuffix", cursorOffset=7)
        parsed = SimpleNamespace(range_in_excerpt=(6, 9), new_editable_region="新😀", cursor_offset_in_new_editable_region=7)
        self.assertEqual(proxy.splice(body, parsed), {"newText": "😀x\n新😀\nsuffix", "cursorOffset": 7})
        self.assertEqual(proxy.utf16_to_byte("😀x", 2), 4)
        with self.assertRaises(ValueError): proxy.utf16_to_byte("😀", 1)
        with self.assertRaises(ValueError): proxy.splice(body, SimpleNamespace(range_in_excerpt=(1, 3), new_editable_region="", cursor_offset_in_new_editable_region=None))

    def test_no_edit_keeps_original_cursor(self):
        body = proxy.Prediction(path="a.py", text="def add(a, b):\n    return a + ", cursorOffset=10)
        parsed = SimpleNamespace(range_in_excerpt=(0, 30), new_editable_region=body.text, cursor_offset_in_new_editable_region=None)
        self.assertEqual(proxy.splice(body, parsed), {"newText": body.text, "cursorOffset": 10})

    def test_http_translation(self):
        captured = {}
        class Zeta:
            Zeta2PromptInput = SimpleNamespace
            Event = SimpleNamespace
            @staticmethod
            def compute_excerpt_ranges(text, cursor):
                captured.update(text=text, cursor=cursor)
                return "ranges"
            @staticmethod
            def format_prompt(value, format):
                captured.update(input=value, format=format)
                return "SPM prompt"
            @staticmethod
            def stop_tokens(format): return ["<|marker_2|>"]
            @staticmethod
            def parse_output(text, format, value):
                return SimpleNamespace(range_in_excerpt=(0, 1), new_editable_region=text, cursor_offset_in_new_editable_region=2)
        def model(request):
            import json
            captured.update(payload=json.loads(request.content), url=str(request.url), auth=request.headers.get("Authorization"))
            return httpx.Response(200, json={"choices": [{"text": "ab", "finish_reason": "stop"}]})
        async def run():
            proxy.app.state.zeta = Zeta
            async with httpx.AsyncClient(transport=httpx.MockTransport(model)) as client:
                proxy.app.state.http = client
                with patch.dict("os.environ", {"ZETA_COMPLETIONS_URL": "https://example.test/generate", "ZETA_MODEL": "zeta-custom", "ZETA_API_KEY": "test-key"}):
                    result = await proxy.predict(proxy.Prediction(path="a", text="a", cursorOffset=1, history=[{"diff":"@@ diff"}]))
                self.assertEqual(result, {"newText":"ab", "cursorOffset":2})
            self.assertEqual(captured["payload"]["prompt"], "SPM prompt")
            self.assertEqual(captured["payload"]["temperature"], 0)
            self.assertEqual(captured["url"], "https://example.test/generate")
            self.assertEqual(captured["auth"], "Bearer test-key")
            self.assertEqual(captured["payload"]["model"], "zeta-custom")
            self.assertEqual(captured["input"].events[0].diff, "@@ diff")
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=proxy.app), base_url="http://proxy") as caller:
                invalid = await caller.post("/predict", json={"path":"a", "text":"😀", "cursorOffset":1})
                self.assertEqual(invalid.status_code, 422)
                async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"choices":[{"text":"partial", "finish_reason":"length"}]}))) as client:
                    proxy.app.state.http = client
                    truncated = await caller.post("/predict", json={"path":"a", "text":"a", "cursorOffset":1})
                    self.assertEqual(truncated.status_code, 502)
        asyncio.run(run())


if __name__ == "__main__": unittest.main()
