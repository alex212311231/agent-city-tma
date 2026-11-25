"""Offline checks of the media handoff and delivery journal (no network credentials)."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import imageio_ffmpeg

import publish
from channels import Rejected, SetupError


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.run_dir = self.base / "run"
        self.run_dir.mkdir()
        self.cfg = {"visibility": "private", "telegram": {"id": "-100111", "handle": "@samplechannel",
                    "url": "https://t.me/samplechannel"}, "youtube": {"id": "abcdefghijk"}}
        self.plan = {"sha256": "testhash", "missing": []}
        self.patch("PRIVATE", self.base)
        self.patch("google_session", MagicMock())
        self.patch("google_channel", return_value=self.cfg["youtube"])
        self.patch("channel_for_bot", return_value=self.cfg["telegram"])

    def patch(self, name, *args, **kwargs):
        handler = patch.object(publish, name, *args, **kwargs)
        self.addCleanup(handler.stop)
        return handler.start()

    def test_real_video_draft_and_cta(self):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error",
                        "-f", "lavfi", "-i", "color=c=black:size=1080x1920:rate=60",
                        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                        "-t", "0.4", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
                        str(self.run_dir / "output.mp4")], check=True)
        data = {"title": "Тест", "description": "Тема", "telegram_text": "Продолжение", "made_for_kids": False}
        (self.run_dir / "post.json").write_text(json.dumps(data), encoding="utf-8")
        plan = publish.prepare(self.run_dir, self.cfg)
        self.assertEqual(plan["missing"], [])
        self.assertEqual(plan["fps"], 60)
        self.assertIn("https://t.me/samplechannel", plan["youtube"]["snippet"]["description"])
        self.assertTrue((self.run_dir / "publish-plan.json").is_file())
        data["cta_url"] = "https://t.me/otherchannel"
        (self.run_dir / "post.json").write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaises(SetupError):
            publish.prepare(self.run_dir, self.cfg)

    def test_partial_refusal_then_success_across_copies(self):
        yt = self.patch("youtube_upload", return_value="k3B7OjQ4s9Z")
        tg = self.patch("telegram_upload", side_effect=[Rejected("HTTP 403"), "12"])
        with self.assertRaises(Rejected):
            publish.distribute(self.run_dir, self.cfg, self.plan)
        publish.distribute(self.run_dir, self.cfg, self.plan)
        copied = self.base / "copy"
        shutil.copytree(self.run_dir, copied)
        publish.distribute(copied, self.cfg, self.plan)
        self.assertEqual(yt.call_count, 1)
        self.assertEqual(tg.call_count, 2)
        self.assertTrue((copied / "published.json").exists())

    def test_unknown_delivery_requires_reconciliation(self):
        yt = self.patch("youtube_upload", return_value="k3B7OjQ4s9Z")
        tg = self.patch("telegram_upload", side_effect=SetupError("timeout"))
        for _ in range(2):
            with self.assertRaises(SetupError):
                publish.distribute(self.run_dir, self.cfg, self.plan)
        self.assertEqual(yt.call_count, 1)
        self.assertEqual(tg.call_count, 1)
        publish.distribute(self.run_dir, self.cfg, self.plan, ["telegram", "45"])
        publish.distribute(self.run_dir, self.cfg, self.plan)
        self.assertEqual(tg.call_count, 1)
        self.assertTrue((self.run_dir / "published.json").is_file())

    def test_channel_change_prevents_writes(self):
        self.patch("channel_for_bot", return_value={"id": "-100999"})
        yt = self.patch("youtube_upload")
        with self.assertRaises(SetupError):
            publish.distribute(self.run_dir, self.cfg, self.plan)
        yt.assert_not_called()


if __name__ == "__main__":
    unittest.main()

