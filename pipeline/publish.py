"""Prepare both posts, then publish to the connected accounts only with --publish."""
import argparse
from contextlib import closing, contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit

import imageio_ffmpeg
import requests

from channels import (PRIVATE, Rejected, SetupError, channel_for_bot, google_channel,
                      google_session, init_private, json_write, read_json, telegram)


def text_field(post, key, limit):
    value = post.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.encode("utf-16-le")) // 2 > limit:
        raise SetupError(f"Проверьте поле post.json {key}, допустимо от 1 до {limit} символов.")
    return value.strip()


def prepare(run, cfg):
    post = read_json(run / "post.json")
    video = run / "output.mp4"
    if not 0 < video.stat().st_size <= 50_000_000:
        raise SetupError("Размер MP4 выходит за предел загрузки этого Telegram-бота (50 МБ).")
    with video.open("rb") as f:
        if f.read(8)[4:8] != b"ftyp":
            raise SetupError("output.mp4 должен быть файлом MP4.")
        f.seek(0)
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    frames = imageio_ffmpeg.read_frames(str(video))
    try:
        meta = next(frames)
    except (OSError, RuntimeError, StopIteration):
        raise SetupError("FFmpeg не смог прочитать видеопоток output.mp4.") from None
    finally:
        frames.close()
    if (tuple(meta["size"]) != (1080, 1920) or abs(meta["fps"] - 60) > 0.1
            or not 0 < meta["duration"] <= 60.05 or not meta.get("audio_codec")
            or meta.get("codec") != "h264"):
        raise SetupError("Нужен H.264 MP4 с озвучкой, 1080×1920, 60 fps, до 60 секунд.")
    title = text_field(post, "title", 100)
    description = text_field(post, "description", 5000)
    caption = text_field(post, "telegram_text", 1024)
    if "<" in title + description or ">" in title + description:
        raise SetupError("Уберите угловые скобки из заголовка и описания YouTube.")
    tags = post.get("tags", [])
    if not isinstance(tags, list) or not all(isinstance(tag, str) and tag.strip() for tag in tags):
        raise SetupError("Поле tags должно быть списком тегов.")
    if sum(len(t) + 2 * (" " in t) for t in tags) + max(0, len(tags) - 1) > 500:
        raise SetupError("Укоротите список тегов до 500 символов.")
    linked = cfg.get("telegram") or {}
    configured_url = linked.get("url")
    cta = post.get("cta_url") or configured_url
    if cta and not re.fullmatch(r"https://t\.me/[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]", cta):
        raise SetupError("CTA должен указывать на публичный канал https://t.me/имя.")
    if cta and configured_url and cta.casefold() != configured_url.casefold():
        raise SetupError("CTA в post.json ведёт в другой канал. Проверьте связку в channels.py.")
    if cta and cta.casefold() not in description.casefold():
        description += "\n\nПродолжение — в Telegram по ссылке в профиле. " + cta
    if len(description.encode("utf-8")) > 5000:
        raise SetupError("Итоговое описание YouTube превышает 5000 байт.")
    missing = []
    if not cfg.get("youtube"):
        missing.append("YouTube OAuth")
    if not linked:
        missing.append("Telegram-канал")
    if type(post.get("made_for_kids")) is not bool:
        missing.append("признак аудитории made_for_kids в post.json")
    status = {"privacyStatus": cfg["visibility"]}
    for key, field in [("made_for_kids", "selfDeclaredMadeForKids"), ("contains_synthetic_media", "containsSyntheticMedia")]:
        if key in post:
            if type(post[key]) is not bool:
                raise SetupError(f"Поле {key} должно быть true или false.")
            status[field] = post[key]
    plan = {"mode": "draft", "sha256": digest, "file": "output.mp4", "duration": meta["duration"],
            "dimensions": meta["size"], "fps": meta["fps"], "cta": cta, "missing": missing,
            "youtube": {"snippet": {"title": title, "description": description, "tags": tags, "categoryId": "22"},
                        "status": status}, "telegram": {"caption": caption}}
    json_write(run / "publish-plan.json", plan)
    return plan


def google_response(response, action):
    if 400 <= response.status_code < 500 and response.status_code != 408:
        raise Rejected(f"YouTube {action}: запрос отклонён (HTTP {response.status_code}).")
    if not 200 <= response.status_code < 300:
        raise SetupError(f"YouTube {action}: результат не подтверждён (HTTP {response.status_code}).")


def youtube_upload(session, plan, video):
    # A resumable session sends metadata separately, without the overhead of base64.
    res = session.post("https://www.googleapis.com/upload/youtube/v3/videos",
                       params={"part": "snippet,status", "uploadType": "resumable", "notifySubscribers": "false"},
                       json=plan["youtube"], headers={"X-Upload-Content-Type": "video/mp4",
                       "X-Upload-Content-Length": str(video.stat().st_size)}, timeout=30, allow_redirects=False)
    google_response(res, "videos.insert")
    location = res.headers.get("Location", "")
    url = urlsplit(location)
    if url.scheme != "https" or url.hostname not in {"www.googleapis.com", "youtube.googleapis.com"} or url.username or url.password:
        raise SetupError("YouTube не вернул официальный адрес загрузки.")
    with video.open("rb") as f:
        res = session.put(location, data=f, headers={"Content-Type": "video/mp4"}, timeout=(10, 180), allow_redirects=False)
    google_response(res, "upload")
    remote_id = res.json().get("id", "")
    if not re.fullmatch(r"[\w-]{11}", remote_id):
        raise SetupError("YouTube не вернул идентификатор ролика.")
    return remote_id


def telegram_upload(channel, plan, video):
    with video.open("rb") as f:
        result = telegram("sendVideo", files={"video": ("output.mp4", f, "video/mp4")},
                          data={"chat_id": channel["id"], "caption": plan["telegram"]["caption"],
                                "supports_streaming": "true"})
    if str(result["chat"]["id"]) != channel["id"] or not isinstance(result["message_id"], int):
        raise SetupError("Telegram не подтвердил публикацию в выбранном канале.")
    return str(result["message_id"])


@contextmanager
def delivery_lock():
    import os
    path = PRIVATE / "publish.lock"
    with path.open("a+b") as f:
        if f.tell() == 0:
            f.write(b"0")
            f.flush()
        f.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise SetupError("Другая публикация ещё выполняется.") from None
        yield


def once(db, key, send):
    stored = db.execute("SELECT receipt FROM deliveries WHERE key=?", (key,)).fetchone()
    if stored:
        if stored[0]:
            return stored[0]
        raise SetupError("Предыдущая попытка осталась без ответа. Сверьте канал и используйте --reconcile.")
    with db:
        db.execute("INSERT INTO deliveries (key,receipt) VALUES (?,NULL)", (key,))
    try:
        receipt = send()
    except Rejected:
        # A definite refusal can be retried after fixing permissions or metadata.
        with db:
            db.execute("DELETE FROM deliveries WHERE key=?", (key,))
        raise
    with db:
        db.execute("UPDATE deliveries SET receipt=? WHERE key=?", (receipt, key))
    return receipt


def distribute(run, cfg, plan, reconcile=None):
    if plan["missing"]:
        raise SetupError("Для публикации требуется: " + ", ".join(plan["missing"]))
    channel = cfg["telegram"]
    youtube = cfg["youtube"]
    keys = {name: f"{plan['sha256']}:{name}:{dest['id']}"
            for name, dest in [("youtube", youtube), ("telegram", channel)]}
    with delivery_lock(), closing(sqlite3.connect(PRIVATE / "deliveries.sqlite3")) as db:
        db.execute("CREATE TABLE IF NOT EXISTS deliveries (key TEXT PRIMARY KEY, receipt TEXT)")
        if reconcile:
            target, receipt = reconcile
            if target not in keys or not (receipt == "absent" or
                    re.fullmatch(r"[\w-]{11}" if target == "youtube" else r"[1-9][0-9]*", receipt)):
                raise SetupError("Для сверки укажите youtube VIDEO_ID, telegram MESSAGE_ID или absent.")
            sql = ("DELETE FROM deliveries WHERE key=? AND receipt IS NULL" if receipt == "absent" else
                   "UPDATE deliveries SET receipt=? WHERE key=? AND receipt IS NULL")
            args = (keys[target],) if receipt == "absent" else (receipt, keys[target])
            with db:
                if db.execute(sql, args).rowcount != 1:
                    raise SetupError("Нет неопределённой попытки для этого файла и канала.")
            print("Результат сверки записан. Для продолжения используйте --publish.")
            return
        with google_session() as session:
            if google_channel(session)["id"] != youtube["id"] or channel_for_bot(channel["handle"])["id"] != channel["id"]:
                raise SetupError("Подключённый канал изменился. Проверьте настройки мастера.")
            video = run / "output.mp4"
            youtube_id = once(db, keys["youtube"], lambda: youtube_upload(session, plan, video))
            telegram_id = once(db, keys["telegram"], lambda: telegram_upload(channel, plan, video))
            receipt = {"youtube": "https://www.youtube.com/shorts/" + youtube_id,
                       "telegram": channel["url"] + "/" + telegram_id}
            json_write(run / "published.json", receipt)
            print(json.dumps(receipt, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, required=True)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--publish", action="store_true")
    action.add_argument("--reconcile", nargs=2, metavar=("PLATFORM", "ID_OR_ABSENT"))
    args = parser.parse_args()
    cfg = init_private()
    plan = prepare(args.run_dir, cfg)
    if args.publish or args.reconcile:
        distribute(args.run_dir, cfg, plan, args.reconcile)
    else:
        print("Черновики YouTube и Telegram готовы: publish-plan.json.")
        if plan["missing"]:
            print("До отправки осталось: " + ", ".join(plan["missing"]))


if __name__ == "__main__":
    try:
        main()
    except (SetupError, FileNotFoundError, json.JSONDecodeError) as exc:
        raise SystemExit(str(exc))
    except (requests.RequestException, OSError, KeyError, ValueError) as exc:
        raise SystemExit(f"Нет подтверждённого результата ({type(exc).__name__}). Проверьте каналы и журнал перед повтором.") from None
    except Exception as exc:
        raise SystemExit(f"Дистрибьютор остановлен ({type(exc).__name__}); проверьте авторизацию и настройки.") from None

