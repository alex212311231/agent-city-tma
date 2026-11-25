"""Draw original editorial slides with no licensed reference footage."""
import math
import os
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PAPER, INK, BLUE = '#EFE9DB', '#192820', '#20594C'


def font(size, bold=False):
    names = ['segoeuib.ttf', 'DejaVuSans-Bold.ttf'] if bold else ['segoeui.ttf', 'DejaVuSans.ttf']
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    raise ValueError('Установите Segoe UI или DejaVu Sans с кириллицей.')


def lines(draw, text, face, width):
    result = []
    for word in text.split():
        if result and draw.textlength(result[-1] + ' ' + word, font=face) <= width:
            result[-1] += ' ' + word
        else:
            result.append(word)
    return result


def moon(size, side):
    rng = random.Random(117)
    rock = Image.new('RGB', (size, size), '#CABFA6')
    d = ImageDraw.Draw(rock)
    for _ in range(240):
        x, y, r = rng.randrange(size), rng.randrange(size), rng.uniform(.002, .042)*size
        box = (x-r, y-r, x+r, y+r*.84)
        d.ellipse(box, fill=rng.choice(['#C0B59C','#B7AE97','#C5BAA1']))
        d.arc(box, 36, 160, fill='#E1D4B8', width=max(1,int(r*.18)))
        d.arc(box, 215, 338, fill='#998F78', width=max(1,int(r*.16)))
    masks, shading = Image.new('L',rock.size), Image.new('L',rock.size)
    pixels, light = masks.load(), shading.load()
    radius = size/2-1
    for y in range(size):
        ny=(y-radius)/radius
        for x in range(size):
            nx=(x-radius)/radius
            sq=1-nx*nx-ny*ny
            if sq < 0:
                continue
            pixels[x,y]=255
            nz=math.sqrt(sq)
            brightness = max(0, nz*.08 - nx*.99) if side else nz*.76 + .24
            light[x,y]=round(28+227*brightness**.57)
    rock=Image.composite(rock,Image.new('RGB',rock.size,'#13231E'),shading)
    rock.putalpha(masks)
    return rock


def render(run, script):
    lunar = script.get('visual_theme') == 'lunar'
    full, half = (moon(360, False), moon(360, True)) if lunar else (None,None)
    for i,s in enumerate(script['slides']):
        im=Image.new('RGB',(1080,1920),PAPER)
        d=ImageDraw.Draw(im)
        header = 'НЕЙРОСЕТИ  /  РАЗБОР ЗАПРОСА' if script.get('visual_theme')=='ai' else 'ПОЛЕВОЙ ЖУРНАЛ' if lunar else 'КОРОТКО О ГЛАВНОМ'
        d.text((84,110),header,font=font(31,True),fill=BLUE)
        d.text((980,110),f'{i+1:02d} / {len(script["slides"]):02d}',anchor='ra',font=font(30),fill=INK)
        d.line((84,180,996,180),fill=INK,width=2)
        for n,line in enumerate(lines(d,s['headline'],font(82,True),890)):
            d.text((78,235+n*94),line,font=font(82,True),fill=INK)
        d.rounded_rectangle((64,630,1016,1232),radius=25,fill=INK)
        for x in range(110,1000,55):
            for y in range(680,1200,55):
                d.ellipse((x,y,x+2,y+2),fill='#54645A')
        if script.get('visual_theme')=='ai' and len(s.get('panel',[]))==4:
            for j in range(2):
                y = 685 + j*273
                d.text((116,y),s['panel'][j*2],font=font(31,True),fill='#A9D9B6')
                for line_no,line in enumerate(lines(d,s['panel'][j*2+1],font(45),827)):
                    d.text((116,y+52+line_no*58),line,font=font(45),fill='#F6F0DE')
            d.line((116,942,961,942),fill='#4E6959',width=2)
        elif lunar and i in (0,3,4):
            im.paste(full,(128,723),full); im.paste(half,(587,723),half)
            for x,label in [(310,'ПОЛНОЛУНИЕ'),(767,'ПОСЛЕДНЯЯ ЧЕТВЕРТЬ')]:
                d.text((x,1123),label,anchor='ma',font=font(24,True),fill='#F4D489')
        elif lunar:
            ground=1034
            d.line((150,ground,938,ground),fill=PAPER,width=5)
            for off,height in ((0,26),(235,78)):
                x=220+off
                d.polygon([(x,ground),(x+74,ground-height),(x+108,ground)],fill='#DCCCA2')
                d.polygon([(x+74,ground-height),(x+108,ground),(x+205,ground)],fill='#778377')
            d.ellipse((155,729,247,821),fill='#FFD579')
            for delta in range(3):
                d.line((245+38*delta,799,510+38*delta,938),fill='#F5D497',width=4)
            d.text((145,1123),'СВЕТ',font=font(25,True),fill='#F4D489')
            d.text((915,1123),'ТЕНЬ',anchor='ra',font=font(25,True),fill=PAPER)
        else:
            d.text((145,730),f'{i+1:02d}',font=font(228,True),fill='#F4D489')
            for n,line in enumerate(lines(d,s['label'],font(47,True),820)):
                d.text((145,1015+n*58),line,font=font(47,True),fill=PAPER)
        for n,line in enumerate(lines(d,s['label'],font(36),900)):
            d.text((84,1260+n*45),line,font=font(36),fill=BLUE)
        im.save(run/f'slide-{i}.png',optimize=True)
