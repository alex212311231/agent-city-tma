import difflib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import wave


from slides import render

TOOLS = Path(os.environ.get('CONTENT_TOOLS', Path(__file__).resolve().parents[2]/'runtime'/'content-tools'))


def tool(name):
    located = shutil.which(name)
    choices = [TOOLS/(name+'.exe'), TOOLS/'whisper'/'Release'/(name+'.exe')]
    return located or str(next((p for p in choices if p.is_file()), name))


def cmd(args, cwd, timeout=350):
    proc = subprocess.run(args, cwd=cwd, timeout=timeout, capture_output=True)
    if proc.returncode:
        raise RuntimeError(f'{Path(args[0]).name}: код {proc.returncode}. ' +
                           proc.stderr.decode(errors='replace')[-300:].strip())
    return proc.stdout


def encode(run, args):
    return cmd([tool('ffmpeg'),'-nostdin','-hide_banner','-loglevel','error','-y',*args],run)


def stamp(seconds):
    cs = max(0,round(seconds*100))
    return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'


def aligned_captions(run, words, transcript, duration):
    normalize = lambda w: re.sub(r'[^а-яa-z0-9]', '', w.lower().replace('ё','е'))
    detected = []
    for segment in transcript['transcription']:
        if not segment.get('tokens'):
            if normalize(segment.get('text','')):
                detected.append(segment)
            continue
        word = None
        for token in segment['tokens']:
            part = token['text']
            if not normalize(part) or part.startswith('[_'):
                continue
            if word is None or part[:1].isspace():
                word = {'text': part, 'offsets': token['offsets']}
                detected.append(word)
            else:
                word['text'] += part
    matcher = difflib.SequenceMatcher(None, [normalize(w['text']) for w in words],
                                      [normalize(s['text']) for s in detected], autojunk=False)
    matches = 0
    for start,other,count in matcher.get_matching_blocks():
        for n in range(count):
            word, hit = words[start+n], detected[other+n]
            instant = hit['offsets']['from']/1000
            if abs(word['start']-instant) < .12:
                word['start'] = .8*word['start']+.2*instant
                matches += 1
    text = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Segoe UI,62,&H00202819,&H007B776E,&H00DBE9EF,&H00DBE9EF,-1,0,0,0,100,100,0,0,1,0,0,5,84,84,0,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    groups = []
    for word in words:
        if not groups or len(groups[-1]) >= 4 or len(' '.join(w['text'] for w in groups[-1]+[word]))>22:
            groups.append([])
        groups[-1].append(word)
    for i,group in enumerate(groups):
        end = min(duration,group[-1]['end']+.10,groups[i+1][0]['start'] if i+1<len(groups) else duration)
        parts=[]
        for k,word in enumerate(group):
            nxt=group[k+1]['start'] if k+1<len(group) else end
            safe=re.sub(r'[{}\\\r\n]','',word['text'])
            parts.append('{\\kf'+str(max(1,round((nxt-word['start'])*100)))+'}'+safe)
        text += f"Dialogue: 0,{stamp(group[0]['start'])},{stamp(end)},Caption,,0,0,0,,{{\\pos(540,1500)}}" + ' '.join(parts)+'\n'
    (run/'captions.ass').write_text(text,encoding='utf-8-sig')
    return matches


def assemble(run, script, note, narration=None):
    render(run, script)
    slides = script['slides']
    words_by_slide = [s['speech'].split() for s in slides]
    counts = [len(group) for group in words_by_slide]
    total = sum(counts)
    transcript = {'transcription': []}
    duration = max(46, min(59, total / 2.1))
    if narration:
        note('Читает готовую озвучку канала', file='narration.wav', api='FFmpeg')
        encode(run, ['-i',str(narration.resolve()),'-ar','16000','-ac','1','narration.wav'])
        with wave.open(str(run/'narration.wav'),'rb') as audio:
            duration = audio.getnframes()/audio.getframerate()
        if not 45 <= duration <= 60:
            raise ValueError('Озвучка для этого формата должна занимать от 45 до 60 секунд.')
        model = Path(os.environ.get('WHISPER_MODEL_PATH',TOOLS/'ggml-tiny.bin'))
        note('Проверяет таймкоды озвучки',file='transcript.json',api='Whisper WASM / CPU')
        cmd(['node',str(Path(__file__).with_name('whisper-web.mjs')),'narration.wav',
             str(model),'transcript.json'],run)
        transcript = json.loads((run/'transcript.json').read_text(encoding='utf-8-sig'))
    words = []
    for group in words_by_slide:
        for word in group:
            index = len(words)
            words.append({'text':word,'start':index*duration/total,'end':(index+1)*duration/total})
    matched = aligned_captions(run,words,transcript,duration)
    spans = [count*duration/total for count in counts]
    timeline = []
    for i,span in enumerate(spans):
        timeline.extend([f"file 'slide-{i}.png'",'option framerate 60',f'duration {span:.8f}'])
    timeline.extend([f"file 'slide-{len(spans)-1}.png'",'option framerate 60'])
    (run/'slides.ffconcat').write_text('\n'.join(timeline)+'\n',encoding='ascii')
    filename = 'output.mp4' if narration else 'storyboard.mp4'
    audio_input = ['-i','narration.wav'] if narration else []
    audio_codec = ['-c:a','aac','-b:a','128k'] if narration else ['-an']
    note('Собирает видео с титрами',file=filename,api='FFmpeg')
    encode(run,['-safe','0','-f','concat','-i','slides.ffconcat',*audio_input,'-vf',
                'fps=60,ass=captions.ass','-c:v','libx264','-threads','4','-preset','veryfast',
                '-crf','23','-pix_fmt','yuv420p',*audio_codec,'-t',f'{duration:.4f}',
                '-movflags','+faststart','render.tmp.mp4'])
    (run/'render.tmp.mp4').replace(run/filename)
    return dict(words=total,whisper_aligned=matched,voice='Дорожка канала' if narration else None)


def validate(run, filename='output.mp4'):
    import imageio_ffmpeg
    frames = imageio_ffmpeg.read_frames(str(run/filename))
    try:
        meta = next(frames)
    finally:
        frames.close()
    duration = meta['duration']
    ok=(meta['codec']=='h264' and tuple(meta['size'])==(1080,1920) and
        abs(meta['fps']-60)<0.01 and (meta.get('audio_codec')=='aac' if filename=='output.mp4' else not meta.get('audio_codec')) and 45<=duration<=60.05)
    if not ok:
        raise ValueError('Проверка FFmpeg: требуется 1080×1920, 60 fps, H.264/AAC, 45–60 секунд.')
    cmd([tool('ffmpeg'),'-v','error','-xerror','-i',filename,'-f','null','-'],run)
    return dict(duration=duration,fps=60,width=1080,height=1920,bytes=(run/filename).stat().st_size)
