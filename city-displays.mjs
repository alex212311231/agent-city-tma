const mono = '"Consolas","Courier New",monospace';
const colors = { mint: '#a7f5c2', blue: '#88bcf7', peach: '#f8be91', gold: '#f7d135', pale: '#e5edf9' };

function surface(THREE, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: true });
  return { context, texture, material };
}

const syntax = /\/\/.*|#.*|'[^']*'|"[^"]*"|\b(?:const|let|def|return|function|if|else|import|from|async|await|export|class|new|throw|for|in|except|try|SELECT|FROM|const|await|assert|test)\b|\b\d+(?:\.\d+)?\b/gu;
function codeLine(ctx, line, x, y, max) {
  let cursor = 0;
  let width = 0;
  for (const match of line.matchAll(syntax)) {
    ctx.fillStyle = colors.pale;
    const text = line.slice(cursor, match.index);
    ctx.fillText(text, x + width, y);
    width += ctx.measureText(text).width;
    if (width > max) return;
    const token = match[0];
    ctx.fillStyle = token.startsWith('#') || token.startsWith('//') ? '#7f9b90' :
      /^['"]/.test(token) ? colors.peach : /^\d/.test(token) ? colors.gold : colors.blue;
    ctx.fillText(token, x + width, y);
    width += ctx.measureText(token).width;
    cursor = match.index + token.length;
  }
  ctx.fillStyle = colors.pale;
  ctx.fillText(line.slice(cursor), x + width, y);
}

export function monitor(THREE) {
  const { context: ctx, texture, material } = surface(THREE, 1024, 576);
  let previous;
  function show(role, activity = '', snippet = '', log = '') {
    const key = [role, activity, snippet, log].join('\u001e');
    if (previous === key) return;
    previous = key;
    ctx.fillStyle = '#102229';
    ctx.fillRect(0, 0, 1024, 576);
    ctx.fillStyle = '#20434c';
    ctx.fillRect(0, 0, 1024, 81);
    ctx.font = '700 36px ' + mono;
    ctx.fillStyle = colors.mint;
    ctx.fillText(role || 'AI HUB', 28, 53, 260);
    ctx.fillStyle = '#f2faf3';
    ctx.font = '500 28px system-ui';
    ctx.fillText(activity || 'Монитор агента', 326, 52, 662);
    if (!snippet && !log) {
      ctx.font = '33px system-ui';
      ctx.fillStyle = '#9aafa9';
      ctx.fillText('Ожидает код или результаты проверок', 48, 165, 920);
      texture.needsUpdate = true;
      return;
    }
    const code = snippet ? snippet.split('\n').slice(0, log ? 7 : 11) : [];
    const lines = [...code.map(line => [line, false]), ...log.split('\n').filter(Boolean).slice(-(11 - code.length)).map(line => [line,true])];
    for (const [index, [line, isLog]] of lines.entries()) {
      const y = 122 + 40 * index;
      const diff = snippet.startsWith('@@') && !isLog;
      if (diff && /^[+-]/.test(line)) {
        ctx.fillStyle = line.startsWith('+') ? '#214539' : '#472e31';
        ctx.fillRect(0, y - 31, 1024, 39);
      }
      ctx.font = '25px ' + mono;
      ctx.fillStyle = '#86aca9';
      ctx.fillText(isLog ? '›' : String(index + 1).padStart(2, '0'), 25, y);
      ctx.font = '27px ' + mono;
      ctx.save();
      ctx.beginPath();
      ctx.rect(82, y - 33, 924, 39);
      ctx.clip();
      codeLine(ctx, line, 84, y, 922);
      ctx.restore();
    }
    texture.needsUpdate = true;
  }
  show();
  return { material, show };
}

const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function billboard(THREE, section) {
  const { context: ctx, texture, material } = surface(THREE, 1024, 512);
  let last;
  function show(state = {}) {
    const { market, jobs, agents } = state;
    const key = JSON.stringify([market, jobs?.grants, agents && Object.values(agents).map(row => row.action)]);
    if (key === last) return;
    last = key;
    const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
    gradient.addColorStop(0, section === 'holiday' ? '#0e4b48' : '#111d3c');
    gradient.addColorStop(1, section === 'grants' ? '#2e1955' : '#0d1a36');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#8ac3ea';
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, 1000, 488);
    if (section === 'market') {
      ctx.fillStyle = '#e6f1fa';
      ctx.font = 'bold 55px system-ui';
      ctx.fillText('MOEX', 50, 90);
      ctx.fillStyle = '#9bc1d1';
      ctx.font = 'bold 31px system-ui';
      ctx.fillText(market?.source === 'iss' ? 'ISS · данные с задержкой' : market ? 'Последнее закрытие · ₽' : 'Ожидаем котировки', 288, 86, 670);
      for (const [i, quote] of (market?.quotes ?? []).slice(0,3).entries()) {
        const y = 179 + i * 103;
        ctx.fillStyle = '#253859';
        ctx.fillRect(47, y - 57, 930, 80);
        ctx.fillStyle = colors.mint;
        ctx.font = 'bold 52px ' + mono;
        ctx.fillText(quote.symbol, 72, y);
        ctx.fillStyle = '#fbf1c8';
        ctx.fillText(formatter.format(quote.price), 355, y);
        ctx.fillStyle = '#b0c3d9';
        ctx.font = '29px ' + mono;
        const stamp = quote.stamp ?? '';
        ctx.fillText(stamp.slice(0,16), 671, y - 4, 270);
      }
    } else if (section === 'grants') {
      ctx.fillStyle = '#fff0bd';
      ctx.font = 'bold 62px system-ui';
      ctx.fillText('РАДАР ГРАНТОВ', 52, 104, 918);
      ctx.fillStyle = '#d9dfed';
      ctx.font = 'bold 42px system-ui';
      const job = jobs?.grants;
      ctx.fillText(job?.detail || 'Ожидает данных', 55, 213, 910);
      ctx.font = '32px ' + mono;
      ctx.fillText(job?.updatedAt ? 'Обновлено · ' + new Date(job.updatedAt).toLocaleString('ru-RU') : 'AI HUB', 55, 306, 910);
      const active = agents ? Object.values(agents).filter(row => row.action !== 'idle').length : 0;
      ctx.fillStyle = '#6ce9d2';
      ctx.fillRect(57, 395, 160 + active * 145, 13);
      ctx.font = '29px system-ui';
      ctx.fillText('Активных агентов · ' + active, 57, 458);
    } else {
      for (let i = 0; i < 68; i++) {
        ctx.fillStyle = i % 3 ? '#d3e7ff' : '#f6d596';
        ctx.fillRect(24 + i * 61 % 976, 24 + i * 67 % 455, 3 + i % 4, 3 + i % 5);
      }
      ctx.fillStyle = '#fff3c1';
      ctx.textAlign = 'center';
      ctx.font = 'bold 60px system-ui';
      ctx.fillText('С НОВЫМ ГОДОМ!', 512, 206);
      ctx.fillStyle = '#f1f6ee';
      ctx.font = 'bold 44px system-ui';
      ctx.fillText('ИЗ ЗИМНЕГО НЬЮ-ЙОРКА', 512, 310, 925);
      ctx.textAlign = 'start';
    }
    for (let y = 0; y < 512; y += 5) {
      ctx.fillStyle = '#040b1c36';
      ctx.fillRect(0, y, 1024, 1);
    }
    texture.needsUpdate = true;
  }
  show();
  return { material, show };
}
