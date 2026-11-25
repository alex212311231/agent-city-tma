"""Run the content team locally. Files stay in the private runtime; publishing is a separate action."""
import argparse
import asyncio
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from uuid import uuid4

from production import assemble, validate
from research import discover, reference_sheet
from writer import write

ROOT = Path(__file__).resolve().parents[2]/'runtime'/'content'


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')


def dump(file, value):
    temp = file.with_suffix('.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    temp.replace(file)


@contextmanager
def lock(run):
    with (run/'run.lock').open('a+b') as f:
        if not f.tell():
            f.write(b'0')
            f.flush()
        f.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        yield


def process(run, opts):
    goal='Подготовить Shorts и пост по теме «'+opts.niche+'»'
    start=time.monotonic()
    active='lead'

    def note(agent,status,task,file='',api='',tokens=0,resources=None):
        row=dict(at=now(),agent=agent,status=status,task=task,file=file,api=api,tokens=tokens,
                 resources=resources or {'elapsedMs':round((time.monotonic()-start)*1000)})
        with (run/'events.jsonl').open('a',encoding='utf-8') as log:
            log.write(json.dumps(row,ensure_ascii=False)+'\n')
    def stage(agent,task,operation,file,**metadata):
        nonlocal active
        active=agent
        note('lead','WORKING',f'Поручает этап: {task}',file)
        note(agent,'WORKING',task,file,**metadata)
        start_stage=time.monotonic()
        for attempt in range(2):
            try:
                result=operation()
                break
            except (TimeoutError,ConnectionError,asyncio.TimeoutError,subprocess.TimeoutExpired) as exc:
                if attempt:
                    raise
                note(agent,'WORKING','Один повтор после временного сетевого сбоя',file)
        tokens, origin = (result[1],result[2]) if agent=='writer' else (0,'')
        res={'elapsedMs':round((time.monotonic()-start_stage)*1000)}
        if origin:
            res['engine']=origin
        if (run/file).exists():
            res['bytes']=(run/file).stat().st_size
        note(agent,'DONE',task+' · готово',file,tokens=tokens,resources=res)
        active='lead'
        return result

    def research():
        report=discover(opts.niche,cap=opts.max_subscribers,ratio=opts.min_ratio,search_size=opts.search_size,
                        on_channel=lambda ch:note('research','WORKING','Сверяет просмотры канала',
                                                  'trends.json','YouTube /channel/'+ch+'/shorts'))
        report['observed_at']=now()
        if not report['trends']:
            dump(run/'trends.json',report)
            raise ValueError('По указанным порогам в выборке нет подходящих Shorts.')
        candidate=next((e for e in report['trends'] if not opts.reference_id or e['id']==opts.reference_id),None)
        if not candidate:
            raise ValueError('Выбранный Short не найден среди прошедших порог.')
        report['selected']=candidate['id']
        note('research','WORKING','Проверяет кадры первых трёх секунд и развитие ролика',
             'reference.jpg','YouTube storyboard')
        candidate['storyboard']=reference_sheet(candidate,run/'reference.jpg')
        dump(run/'trends.json',report)
        return report,candidate

    try:
        note('lead','WORKING',goal)
        # A resume reuses finished stages of this run only, including the exact observed source.
        if opts.resume and (run/'trends.json').exists() and json.loads((run/'trends.json').read_text(encoding='utf-8')).get('selected'):
            report=json.loads((run/'trends.json').read_text(encoding='utf-8'))
            candidate=next(t for t in report['trends'] if t['id']==report['selected'])
        else:
            report,candidate=stage('research','Найти аномальный Short небольшого автора',research,'trends.json')
        def writer():
            s,t,origin=write(run,candidate,opts.draft)
            candidate.update(hook=s['observed_hook'],retention=s['retention'])
            dump(run/'trends.json',report)
            dump(run/'script.json',s)
            return s,t,origin
        if opts.resume and (run/'script.json').exists():
            script=json.loads((run/'script.json').read_text(encoding='utf-8'))
        else:
            script,_,_=stage('writer','Разобрать хук и написать оригинальные русские тексты',writer,'script.json')
        if not (opts.resume and (run/'output.mp4').exists()):
            media=stage('production','Создать озвучку, слайды и субтитры',lambda:assemble(run,script,
                         lambda task,**kw:note('production','WORKING',task,**kw)),'output.mp4')
            dump(run/'assembly.json',media)
        note('lead','WORKING','Проверяет кодеки, длительность и декодирует каждый кадр','output.mp4','FFmpeg')
        checked=validate(run)
        dump(run/'validation.json',checked)
        post={k:script[k] for k in ('title','description','telegram_text')}
        for key in ('contains_synthetic_media','made_for_kids'):
            if key in script:
                post[key]=script[key]
        dump(run/'post.json',post)
        def distribution():
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('publish.py')),
                                   '--run-dir',str(run)],capture_output=True,text=True,encoding='utf-8',
                                  errors='replace',timeout=60)
            if result.returncode:
                raise ValueError('Дистрибьютор не смог подготовить план: '+result.stderr[-150:])
        stage('distribution','Подготовить черновики YouTube и Telegram',distribution,'publish-plan.json')
        note('lead','DONE','Ролик проверен. Черновики подготовлены для владельца.','output.mp4',resources=checked)
        return 0
    except Exception as exc:
        # Do not copy raw third-party HTTP URLs, prompts or errors containing credentials into the UI.
        message=str(exc) if isinstance(exc,ValueError) else type(exc).__name__
        summary=re.sub(r'https?://\S+', '[endpoint]',message).replace('\n',' ')[:200]
        if active!='lead':
            note(active,'ERROR',summary)
        note('lead','ERROR','Этап '+active+' остановлен. '+summary)
        print(summary,file=sys.stderr)
        return 1


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--niche',required=True)
    parser.add_argument('--run-id',default=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')+'-'+uuid4().hex[:6])
    parser.add_argument('--max-subscribers',type=int,default=50000)
    parser.add_argument('--min-ratio',type=float,default=5.0)
    parser.add_argument('--search-size',type=int,default=24)
    parser.add_argument('--reference-id')
    parser.add_argument('--draft',type=Path)
    parser.add_argument('--resume',action='store_true')
    opts=parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,70}',opts.run_id) or not opts.niche.strip() or len(opts.niche)>150:
        parser.error('Недопустимое имя прогона или ниша.')
    if not (1<=opts.max_subscribers<=50000 and 5<=opts.min_ratio<=1000 and 1<=opts.search_size<=60):
        parser.error('Неверные пороги исследования.')
    run=ROOT/opts.run_id
    if opts.resume and not run.exists():
        parser.error('Нет такого прогона для продолжения.')
    if run.exists() and not opts.resume:
        parser.error('Для существующего прогона передайте --resume.')
    run.mkdir(parents=True,exist_ok=opts.resume)
    print(run,flush=True)
    with lock(run):
        return process(run,opts)

if __name__=='__main__':
    raise SystemExit(main())
