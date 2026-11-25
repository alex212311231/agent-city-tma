"""Discover small creators and rank Shorts against the same channel's recent Shorts."""
import concurrent.futures
import re
from statistics import mean

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


def extract(url, limit):
    options = dict(quiet=True, no_warnings=True, extract_flat=True, socket_timeout=10,
                   retries=1, extractor_retries=1, playlistend=limit, cachedir=False)
    with YoutubeDL(options) as yt:
        return yt.extract_info(url, download=False)


def investigate(channel, query, cap, ratio, sample_size):
    if not re.fullmatch(r'UC[A-Za-z0-9_-]{22}', channel):
        return []
    url = f'https://www.youtube.com/channel/{channel}/shorts'
    page = extract(url, sample_size)
    subscribers = page.get('channel_follower_count')
    if not isinstance(subscribers, int) or not 0 < subscribers <= cap:
        return []
    entries = [r for r in page.get('entries', []) if isinstance(r.get('view_count'), int)]
    terms = {s.casefold() for s in re.findall(r'[^\W_]{3,}', query) if s.lower() not in {'shorts', 'youtube'}}
    found = []
    for entry in entries:
        title = entry.get('title', '')
        if not any(term in title.casefold() for term in terms):
            continue
        peers = {r['id']:r['view_count'] for r in entries if r['id'] != entry['id']}
        if len(peers) < 5 or not (average := mean(peers.values())):
            continue
        score = entry['view_count'] / average
        if score < ratio:
            continue
        found.append(dict(id=entry['id'], title=title, url=f"https://www.youtube.com/shorts/{entry['id']}",
                          channel=page.get('channel'), channel_url=url, subscribers=subscribers,
                          views=entry['view_count'], average_views=round(average, 2), ratio=round(score, 2),
                          peers=peers, count_precision='Rounded public Shorts-tab counters'))
    return found


def discover(query, cap=50000, ratio=5, search_size=18, sample_size=24, on_channel=None):
    entries = extract(f'ytsearch{search_size}:{query} #shorts', search_size)['entries']
    channels = list(dict.fromkeys(row['channel_id'] for row in entries if row.get('channel_id')))
    ranked = []
    failed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tasks = {pool.submit(investigate, ch, query, cap, ratio, sample_size): ch for ch in channels}
        for task in concurrent.futures.as_completed(tasks):
            try:
                ranked.extend(task.result())
            except DownloadError:
                failed += 1
            if on_channel:
                on_channel(tasks[task])
    ranked.sort(key=lambda item: item['ratio'], reverse=True)
    return dict(query=query, max_subscribers=cap, minimum_ratio=ratio, channels=len(channels),
                inaccessible=failed, sample_size=sample_size, trends=ranked)

def reference_sheet(candidate, target):
    """Sample the actual public storyboard, including opening seconds. Never use it as footage."""
    import io
    from urllib.request import Request, urlopen
    from PIL import Image, ImageDraw

    options = dict(quiet=True, no_warnings=True, socket_timeout=12, retries=1, cachedir=False,
                   skip_download=True)
    with YoutubeDL(options) as yt:
        data = yt.extract_info(candidate['url'], download=False)
    boards = [f for f in data.get('formats', []) if f.get('ext') == 'mhtml' and f.get('fragments')
              and f.get('fps') and f.get('rows') and f.get('columns')]
    if not boards:
        raise ValueError('YouTube не предоставил раскадровку для проверки хука')
    fmt = max(boards, key=lambda f: f['height'])
    width, height, cols, rows = (fmt[k] for k in ('width', 'height', 'columns', 'rows'))
    duration = data['duration']
    times = list(dict.fromkeys([0, 1, 2, *[int(duration*r) for r in (.28, .55, .84)]]))
    sheet = Image.new('RGB', (len(times) * 176, 340), '#121721')
    draw, cache = ImageDraw.Draw(sheet), {}
    for i, tick in enumerate(times):
        n = min(int(tick * fmt['fps']), len(fmt['fragments']) * rows * cols - 1)
        page, slot = divmod(n, rows*cols)
        if page not in cache:
            req = Request(fmt['fragments'][page]['url'], headers={'User-Agent':'Mozilla/5.0'})
            with urlopen(req, timeout=15) as response:
                cache[page] = Image.open(io.BytesIO(response.read())).convert('RGB')
        left, top = (slot % cols)*width, (slot // cols)*height
        image = cache[page].crop((left, top, left+width, top+height))
        image.thumbnail((172, 302))
        # Source storyboards are thumbnail-sized; scale proportionally for review.
        scale = min(172/image.width, 302/image.height)
        image = image.resize((round(image.width*scale), round(image.height*scale)))
        sheet.paste(image, (i*176+(176-image.width)//2, (302-image.height)//2))
        draw.text((i*176+8, 312), f'{tick} s', fill='white')
    sheet.save(target)
    return dict(sample_seconds=times, exact_views=data.get('view_count'), duration=duration,
                upload_date=data.get('upload_date'), source='YouTube storyboard', file=target.name)
