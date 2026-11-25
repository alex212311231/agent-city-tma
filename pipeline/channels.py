"""Connect local publishing accounts. Tokens and destinations stay outside the checkout."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

import requests

REPO = Path(__file__).resolve().parents[1]
HUB = REPO.parent
PRIVATE = Path(os.environ.get("AI_HUB_PUBLISH_HOME", HUB / "runtime" / "publisher")).resolve()
SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
HANDLE = re.compile(r"@[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]\Z")
DEFAULT = {"youtube": None, "telegram": None, "visibility": "private"}


class SetupError(ValueError):
    pass


def json_write(path, data):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", delete=False, dir=path.parent) as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
        target = f.name
    try:
        os.replace(target, path)
    finally:
        Path(target).unlink(missing_ok=True)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def init_private():
    if PRIVATE == REPO or REPO in PRIVATE.parents:
        raise SetupError("Папка учётных данных должна находиться за пределами репозитория.")
    PRIVATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.name == "nt":
        # A private per-user ACL also applies to future SQLite journals and temp files.
        sid_csv = subprocess.check_output(["whoami", "/user", "/fo", "csv", "/nh"], encoding="ascii", errors="ignore")
        sid = re.search(r"S-1-[0-9-]+", sid_csv)
        if not sid:
            raise SetupError("Windows не вернула SID текущего пользователя.")
        subprocess.run(["icacls", str(PRIVATE), "/grant:r", f"*{sid[0]}:(OI)(CI)F",
                        "*S-1-5-18:(OI)(CI)F", "/inheritance:r"], check=True, stdout=subprocess.DEVNULL)
    else:
        PRIVATE.chmod(0o700)
    config_path = PRIVATE / "channels.json"
    if not config_path.exists():
        json_write(config_path, DEFAULT)
    return read_json(config_path)


def bot_key():
    key = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not key:
        env_file = HUB / ".env"
        if env_file.is_file():
            with env_file.open(encoding="utf-8-sig") as f:
                for line in f:
                    if line.startswith("TELEGRAM_BOT_TOKEN="):
                        key = line.partition("=")[2].strip().strip('"').strip("'")
                        break
    if not key or not re.fullmatch(r"\d+:[\w-]+", key):
        raise SetupError("Нужен TELEGRAM_BOT_TOKEN в окружении службы или локальном .env AI Hub.")
    return key


class Rejected(SetupError):
    """The service explicitly refused this request before delivery."""


def telegram(method, *, data=None, files=None):
    # Never log requests exceptions, URLs or server bodies: they can contain credentials.
    try:
        resp = requests.post(f"https://api.telegram.org/bot{bot_key()}/{method}", data=data,
                             files=files, timeout=(10, 180), allow_redirects=False)
    except requests.RequestException:
        raise SetupError(f"Telegram {method}: нет подтверждённого ответа.") from None
    if 400 <= resp.status_code < 500 and resp.status_code != 408:
        raise Rejected(f"Telegram {method}: запрос отклонён (HTTP {resp.status_code}).")
    try:
        payload = resp.json()
        if resp.ok and payload["ok"]:
            return payload["result"]
    except (KeyError, ValueError):
        pass
    raise SetupError(f"Telegram {method}: не удалось подтвердить результат (HTTP {resp.status_code}).")


def channel_for_bot(handle):
    if not HANDLE.fullmatch(handle):
        raise SetupError("Укажите публичное @имя канала Telegram.")
    chat = telegram("getChat", data={"chat_id": handle})
    if chat["type"] != "channel" or ("@" + chat.get("username", "")).casefold() != handle.casefold():
        raise SetupError("Это имя должно принадлежать каналу Telegram.")
    bot = telegram("getMe")
    member = telegram("getChatMember", data={"chat_id": chat["id"], "user_id": bot["id"]})
    if member["status"] != "creator" and not member.get("can_post_messages"):
        raise SetupError("Назначьте бота администратором канала с правом публикации.")
    return {"id": str(chat["id"]), "handle": "@" + chat["username"], "url": "https://t.me/" + chat["username"]}


def google_session():
    from google.auth.transport.requests import AuthorizedSession, Request
    from google.oauth2.credentials import Credentials

    path = PRIVATE / "youtube-token.json"
    if not path.is_file():
        raise SetupError("Подключите YouTube через channels.py --youtube ПУТЬ.")
    credentials = Credentials.from_authorized_user_file(str(path), scopes=SCOPES)
    if not credentials.valid:
        credentials.refresh(Request())
        json_write(path, json.loads(credentials.to_json()))
    # No automatic re-delivery of an upload in case the access token expires.
    return AuthorizedSession(credentials, max_refresh_attempts=0)


def google_channel(session):
    r = session.get(CHANNELS_URL, params={"part": "id,snippet", "mine": "true"},
                    timeout=20, allow_redirects=False)
    if r.status_code != 200:
        raise SetupError(f"YouTube channels.list: HTTP {r.status_code}. Проверьте доступ к API.")
    channels = r.json().get("items", [])
    if len(channels) != 1:
        raise SetupError("Создайте канал YouTube и при авторизации выберите один нужный канал.")
    return {"id": channels[0]["id"], "title": channels[0]["snippet"]["title"]}


def connect_google(client_path):
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import AuthorizedSession

    client = read_json(client_path).get("installed", {})
    if not client.get("client_id", "").endswith(".apps.googleusercontent.com") or not client.get("client_secret"):
        raise SetupError("Нужен OAuth JSON приложения типа Desktop из Google Cloud.")
    # Use the official endpoints even when reading a user-selected configuration file.
    client.update(auth_uri="https://accounts.google.com/o/oauth2/auth", token_uri="https://oauth2.googleapis.com/token")
    flow = InstalledAppFlow.from_client_config({"installed": client}, SCOPES, autogenerate_code_verifier=True)
    creds = flow.run_local_server(host="127.0.0.1", port=0, timeout_seconds=180,
                                  prompt="select_account consent", authorization_prompt_message="Подтвердите доступ в браузере.",
                                  success_message="Канал подключён. Можно закрыть эту вкладку.")
    if not creds.refresh_token:
        raise SetupError("Google не вернул разрешение для фоновой загрузки. Повторите выбор канала.")
    with AuthorizedSession(creds) as session:
        channel = google_channel(session)
    json_write(PRIVATE / "youtube-token.json", json.loads(creds.to_json()))
    return channel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--youtube", type=Path, metavar="CLIENT_JSON")
    parser.add_argument("--telegram", metavar="@PUBLIC_CHANNEL")
    parser.add_argument("--visibility", choices=["private", "unlisted", "public"])
    args = parser.parse_args()
    cfg = init_private()
    if args.youtube:
        cfg["youtube"] = connect_google(args.youtube)
        json_write(PRIVATE / "channels.json", cfg)
    if args.telegram:
        cfg["telegram"] = channel_for_bot(args.telegram)
        json_write(PRIVATE / "channels.json", cfg)
    if args.visibility:
        cfg["visibility"] = args.visibility
        json_write(PRIVATE / "channels.json", cfg)
    print("YouTube:", cfg["youtube"]["title"] if cfg["youtube"] else "ожидает подключения OAuth (--youtube CLIENT_JSON)")
    print("Telegram:", cfg["telegram"]["handle"] if cfg["telegram"] else "ожидает публичного канала (--telegram @CHANNEL)")
    print("Видимость ролика в YouTube:", cfg["visibility"])
    print("Следующие шаги: pipeline/CHANNELS.md")


if __name__ == "__main__":
    try:
        main()
    except (SetupError, FileNotFoundError) as exc:
        raise SystemExit(str(exc))
    except Exception as exc:
        raise SystemExit(f"Подключение прервано ({type(exc).__name__}). Проверьте настройки и повторите вход.") from None

