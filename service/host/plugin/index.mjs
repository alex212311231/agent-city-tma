import { createHash, randomUUID } from 'node:crypto';
import { activeJob, agentNames, decide, getMode, modeButtons, modes, officeFetch, readJob, requestStop, sendMenu, setMode, telegram } from '../team-control.mjs';

function ownerSender(value) {
  const id = /^(?:telegram:(?:user:)?)?(\d+)$/.exec(String(value ?? ''))?.[1];
  return Boolean(id && id === process.env.TELEGRAM_CHAT_ID);
}

function messageRequestId(messageId) {
  if (!messageId) return randomUUID();
  const hash = createHash('sha256').update('telegram:' + process.env.TELEGRAM_CHAT_ID + ':' + messageId).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

export function isDirectTask(text) {
  if (typeof text !== 'string' || text.startsWith('/') ||
      /^\s*(?:не|отмени|расскажи|как|можно ли|почему|что)\s/iu.test(text)) return false;
  return /^\s*(?:задача|поручение)\s*:/iu.test(text) ||
    /^\s*(?:пожалуйста[\s,]+)?(?:сделай|создай|собери|сверстай|напиши|доработай|исправь|обнови|проверь)\s+[\s\S]{0,150}?(?:сайт|приложени|проект|бот(?:а|у)?(?=$|[\s,.!?])|код|файл|лендинг|страниц|интерфейс|терминал|тест)/iu.test(text);
}

async function submit(api, task, requestId) {
  if (!task.trim() || /^\/(?:b|build)(?:@\w+)?\s*$/i.test(task)) return 'Пришлите поручение следующим сообщением или после /build.';
  try {
    const response = await officeFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ requestId, task }),
    });
    const result = await response.json();
    if (!response.ok) return result.error ?? 'Не удалось принять задание.';
    if (result.duplicate) return 'Это задание уже принято · ' + result.label;
    if (result.queued) return result.wakeConfirmed ? 'Поручение в очереди вашей беседы Codex.' : 'Поручение сохранено в очереди вашей беседы Codex. Автоматическое возобновление пока не подтверждено.';
    return null;
  } catch {
    api.logger.error('AI Hub task service is unavailable');
    return 'Сервис заданий временно недоступен.';
  }
}

const time = value => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' }) : '—';
const commandPattern = /^\/(status|team|stop|build|b)(?:@ClaudeNFications_bot)?(?:\s+(.*))?$/isu;

export async function statusText() {
  const [current, mode, office, dashboard] = await Promise.all([
    activeJob(), getMode(), officeFetch('/api/status').then(response => response.ok ? response.json() : null).catch(() => null),
    officeFetch('/api/dashboard').then(response => response.ok ? response.json() : null).catch(() => null),
  ]);
  const job = current && await readJob(current.id);
  const jobLabel = job?.label ?? current?.label;
  const agentList = job?.active ?? [];
  const rows = [
    'AI Hub · ' + modes[mode],
    current ? 'Задача · ' + [jobLabel, job?.task, job?.detail ?? 'Стартует'].filter(Boolean).join(' · ') : 'Задача · нет активной',
    'Агенты · ' + (agentList.map(role => agentNames[role]).filter(Boolean).join(', ') || 'свободны'),
    'Обновление задачи · ' + time(job?.updatedAt ?? current?.started ?? office?.agents?.lead?.updatedAt),
  ];
  if (dashboard?.lead) {
    rows.push('Контент · ' + dashboard.lead.status + ' · ' + dashboard.lead.task);
    const active = dashboard.agents.filter(a => a.status === 'WORKING').map(a => a.name);
    if (active.length) rows.push('Сейчас работают · ' + active.join(', '));
  }
  for (const [key, label] of [['moex', 'MOEX'], ['grants', 'Grants Radar']]) {
    const service = office?.jobs?.[key];
    rows.push(label + ' · ' + (service ? (service.detail || service.phase) + ' · ' + time(service.updatedAt) : 'статус недоступен'));
  }
  return rows.join('\n');
}

async function showMenu(api) {
  try { await sendMenu(); return null; }
  catch { api.logger.error('AI Hub control menu unavailable'); return 'Пульт Telegram временно недоступен.'; }
}

export default {
  id: 'ai-hub',
  name: 'AI Hub',
  description: 'Private Telegram controls for the Codex team lead',
  register(api) {
    for (const [name, description, acceptsArgs] of [
      ['build', 'Передать поручение Тимлиду', true],
      ['team', 'Выбрать режим команды', false],
    ]) {
      api.registerCommand({
        name, description, acceptsArgs, requireAuth: true,
        async handler(context) {
          if ((context.channelId ?? context.channel) !== 'telegram' || !context.isAuthorizedSender ||
              !ownerSender(context.senderId ?? context.from) ||
              (context.to && !ownerSender(context.to))) {
            return { text: 'Команда доступна владельцу в личном Telegram-чате.' };
          }
          const response = name === 'team' ? await showMenu(api) : await submit(api, context.commandBody ?? ('/build ' + (context.args ?? '')), messageRequestId(context.messageId ?? null));
          return response ? { text: response } : {};
        },
      });
    }

    // OpenClaw's fast-abort command runs before before_dispatch. Its inbound
    // observation hook also reaches the queue worker, which is a separate process.
    api.on('message_received', async (event, context) => {
      const command = commandPattern.exec((event.content ?? '').trim());
      if (context.channelId !== 'telegram' || command?.[1].toLowerCase() !== 'stop' ||
          !ownerSender(event.senderId ?? event.from) || !ownerSender(context.conversationId)) return;
      await requestStop();
    });

    api.on('before_dispatch', async (event, context) => {
      const message = event.content ?? event.body ?? '';
      if ((context.channelId ?? event.channel) !== 'telegram' || event.isGroup ||
          !ownerSender(context.senderId ?? event.senderId) || (context.conversationId && !ownerSender(context.conversationId))) return;
      const command = commandPattern.exec(message);
      let reply;
      if (command) {
        switch (command[1].toLowerCase()) {
          case 'status': reply = await statusText(); break;
          case 'team': reply = await showMenu(api); break;
          case 'stop': reply = await requestStop() ? 'Запрошена остановка задания.' : 'Нет активного задания.'; break;
          default: reply = await submit(api, message, messageRequestId(context.messageId ?? event.messageId));
        }
      } else if (message.trim() && !message.trimStart().startsWith('/')) {
        reply = await submit(api, message, messageRequestId(context.messageId ?? event.messageId));
      } else return;
      return reply ? { handled: true, text: reply } : { handled: true };
    }, { timeoutMs: 38000 });

    api.registerInteractiveHandler({
      channel: 'telegram',
      namespace: 'hub',
      async handler(context) {
        if (context.isGroup || !context.auth?.isAuthorizedSender ||
            !ownerSender(context.senderId) || !ownerSender(context.callback?.chatId)) return { handled: true };
        const [action, value] = context.callback.payload.split(':');
        if (action === 'mode' && Object.hasOwn(modes, value)) {
          await setMode(value);
          await telegram('editMessageText', {
            message_id: context.callback.messageId,
            text: 'Пульт AI Hub · ' + modes[value] + '\nРежим применяется к следующим заданиям.\n/status · /team · /stop · /build',
            reply_markup: { inline_keyboard: modeButtons(value) },
          });
        } else if (['start', 'cancel'].includes(action) && /^[0-9a-f-]{36}$/i.test(value ?? '')) {
          if (!await decide(value, action)) await context.respond.clearButtons();
        }
        return { handled: true };
      },
    });
  },
};

