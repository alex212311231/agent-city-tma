# Подключение YouTube и Telegram

Мастер хранит настройки, OAuth и журнал отправок в `C:\Projects\ai-hub\runtime\publisher`. В Windows папку защищают разрешения файловой системы. Коды входа вводятся на странице Google или в приложении Telegram. В чат с ботом их отправлять не требуется.

## 1. Открой мастер

В PowerShell перейди в папку проекта и проверь подключения.

```powershell
Set-Location C:\Projects\ai-hub\agent-city-tma
$python = '..\runtime\content-venv\Scripts\python.exe'
& $python -m pip install -r pipeline\requirements-publish.txt
& $python pipeline\channels.py
```

## 2. Подключи YouTube

1. Открой свой YouTube, нажми на аватар и создай канал. До 18 лет YouTube требует разрешения родителя или опекуна. Минимальный возраст самостоятельного аккаунта Google и доступность загрузок зависят от региона и типа аккаунта. Учитывай правила, показанные для твоего аккаунта. [Создание канала](https://support.google.com/youtube/answer/1646861?hl=ru) · [Условия YouTube](https://www.youtube.com/static?template=terms) · [Возраст аккаунта Google](https://support.google.com/accounts/answer/1350409?hl=ru) · [Семейные настройки](https://support.google.com/youtube/answer/15253498?hl=ru)
2. Выбери проект в Google Cloud, включи YouTube Data API v3, настрой экран согласия Google Auth Platform. Если приложение в режиме Testing, добавь свой аккаунт в Test users. Создай OAuth Client ID типа **Desktop app**, скачай JSON и укажи его локальный путь в команде ниже. [Включить API](https://console.cloud.google.com/apis/library/youtube.googleapis.com) · [Создать OAuth-клиент](https://console.cloud.google.com/auth/clients) · [Руководство Google](https://developers.google.com/youtube/data/guides/uploading_a_video)
3. В открывшемся браузере выбери нужный канал и подтверди разрешения на чтение информации о канале и загрузку видео. Мастер принимает ответ Google на случайном локальном порту, сохраняет подключение и показывает название канала. Если Google отзовёт доступ, выполни эту команду снова.

```powershell
& $python pipeline\channels.py --youtube "$env:USERPROFILE\Downloads\client_secret.json"
```

## 3. Свяжи Telegram-канал

1. В Telegram выбери «Создать канал». Укажи публичное имя своего канала. Ориентируйся на местные условия Telegram, в ЕС для регистрации требуется 18 лет. [Справка о каналах](https://telegram.org/faq_channels/) · [Условия Telegram](https://telegram.org/tos)
2. Добавь `@ClaudeNFications_bot` в администраторы канала и включи «Публикация сообщений». Подставь публичное имя в команду ниже. Мастер проверит тип канала, его идентификатор и право бота на публикацию через Bot API. Личный чат с ботом остаётся пультом управления. [Telegram Bot API](https://core.telegram.org/bots/api#getchatmember)
3. В YouTube Studio в настройках профиля канала добавь публичную ссылку Telegram из мастера. В Shorts зрителю удобно сказать «продолжение по ссылке в профиле». YouTube отключает кликабельность внешних ссылок в описаниях и комментариях Shorts. [Правила ссылок YouTube](https://support.google.com/youtube/answer/13748639?hl=ru)

```powershell
& $python pipeline\channels.py --telegram '@ИМЯ_КАНАЛА'
```

## 4. Проверь и отправь

Сценарист кладёт рядом с `output.mp4` файл `post.json` с полями `title`, `description`, `telegram_text` (продолжение темы для канала), `tags` и `made_for_kids`. Определи последнюю настройку по аудитории конкретного ролика. Для реалистично изменённых или синтетических материалов укажи `contains_synthetic_media` по правилам YouTube. При наличии настроенного Telegram мастер подставляет ссылку на канал в описание. [Определение аудитории](https://support.google.com/youtube/answer/9527654?hl=ru) · [Раскрытие синтетического контента](https://support.google.com/youtube/answer/14328491?hl=ru)

```powershell
$run = '..\runtime\content\ИМЯ_ПРОГОНА'
& $python pipeline\publish.py --run-dir $run
```

Открой `output.mp4` и `publish-plan.json` в папке запуска. Посмотри видео с озвучкой, подписи, аудиторию и текст для Telegram. Слово `missing` в плане показывает, что осталось подключить. Черновой режим проверяет реальное видео локально, без вызовов YouTube и Telegram.

YouTube по умолчанию сохранит ролик приватно. Для публичного Shorts выбери видимость явно. Команда с `--publish` отправит видео в оба подключённых канала. Telegram опубликует пост сразу, в том числе при приватной видимости YouTube. Обе ссылки появятся в `published.json`.

```powershell
& $python pipeline\channels.py --visibility public
& $python pipeline\publish.py --run-dir $run --publish
```

## Возобновление после ошибки

Журнал различает хеш видео, платформу и идентификатор канала. При повторном запуске успешную отправку для этого видео дистрибьютор пропускает. Если сервер явно отклонил отправку, исправь указанную причину и повтори `--publish`.

Если интернет прервался после отправки, проверь историю конкретного Telegram-канала или YouTube Studio. Когда ролик уже есть, подставь фактический ID в команду сверки. Если отправка точно отсутствует, укажи `absent` вместо ID. После сверки повтори `--publish`. Команда сверки только меняет локальную запись.

```powershell
& $python pipeline\publish.py --run-dir $run --reconcile youtube VIDEO_ID
& $python pipeline\publish.py --run-dir $run --reconcile telegram MESSAGE_ID
```

