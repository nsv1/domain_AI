import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (nginx reverse proxy)
app.set('trust proxy', 1);

// CORS — разрешаем запросы с любого origin (для reverse proxy)
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Пути к системным файлам (можно переопределить через ENV)
const DOMAINS_FILE = process.env.DOMAINS_FILE || '/etc/ai-domains.list';
const LOG_FILE = process.env.LOG_FILE || '/var/log/ai-router.log';
const SCRIPT_PATH = process.env.SCRIPT_PATH || '/usr/local/bin/update-ai-router.sh';

// Состояние последнего фонового запуска update-ai-router.sh
let processScriptExit = null;   // код завершения (null — ещё не завершился)
let processFinished = false;    // скрипт завершён (успешно или нет)
let processError = null;        // текст ошибки запуска
let processStartedAt = null;    // время старта для отсечки лога

// Парсинг доменов из текста (убираем комментарии и пустые строки)
function parseDomains(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line !== '---');
}

// API: Обработка доменов
app.post('/api/process', async (req, res) => {
  const { domains } = req.body;

  if (!domains || typeof domains !== 'string') {
    return res.status(400).json({ error: 'Необходимо предоставить список доменов' });
  }

  const parsedDomains = parseDomains(domains);

  if (parsedDomains.length === 0) {
    return res.status(400).json({ error: 'Не найдено ни одного домена' });
  }

  // Записываем исходный текст как есть — скрипт сам фильтрует комментарии и разделители
  const domainsContent = domains.endsWith('\n') ? domains : domains + '\n';

  try {
    fs.writeFileSync(DOMAINS_FILE, domainsContent, 'utf8');
    console.log(`✅ Домены сохранены в ${DOMAINS_FILE} (${parsedDomains.length} шт.)`);

    // Сбрасываем состояние предыдущего запуска
    processScriptExit = null;
    processFinished = false;
    processError = null;
    processStartedAt = Date.now();

    // Используем spawn с shell: true для лучшей совместимости с sudo и tee
    const child = spawn(`sudo ${SCRIPT_PATH} 2>&1`, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let output = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write('[OUT] ' + chunk);
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stderr.write('[ERR] ' + chunk);
    });

    // Ответ должен уйти ДО завершения скрипта: nginx/Vite прокси обрывают
    // долгие молчаливые запросы и возвращают HTML-страницу ошибки (502/504),
    // которую фронтенд не может распарсить как JSON. Поэтому отвечаем сразу,
    // а лог скрипта пишем в файл — фронтенд опрашивает /api/process-log.
    res.json({
      success: true,
      started: true,
      pid: child.pid,
      domainsCount: parsedDomains.length,
      logFile: LOG_FILE,
      log: output || '🚀 Скрипт запущен, живой лог ниже...\n',
    });

    // Вывод скрипта продолжается в фоне: дописываем его в LOG_FILE,
    // чтобы /api/process-log мог отдать полный лог даже после рестарта сервиса
    child.stdout.on('data', (data) => {
      try { fs.appendFileSync(LOG_FILE, data.toString()); } catch { /* ignore */ }
    });
    child.stderr.on('data', (data) => {
      try { fs.appendFileSync(LOG_FILE, data.toString()); } catch { /* ignore */ }
    });

    // Таймаут 300 секунд (резолвинг сотен доменов через 5 DNS занимает время)
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      try { fs.appendFileSync(LOG_FILE, '\n❌ Скрипт завершён по таймауту (300 сек)\n'); } catch { /* ignore */ }
      console.error('Скрипт завершён по таймауту (300 сек)');
    }, 300000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      processScriptExit = code;
      processFinished = true;
      if (code !== 0) {
        console.error(`Скрипт завершился с кодом: ${code}`);
        try { fs.appendFileSync(LOG_FILE, `\n❌ Скрипт завершился с кодом: ${code}\n`); } catch { /* ignore */ }
      } else {
        console.log('Скрипт обработки завершился успешно');
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Ошибка запуска скрипта: ${err.message}`);
      processError = err.message;
      processFinished = true;
      try { fs.appendFileSync(LOG_FILE, `\n❌ Ошибка запуска скрипта: ${err.message}\n`); } catch { /* ignore */ }
    });
  } catch (writeError) {
    console.error(`Ошибка записи файла: ${writeError.message}`);
    return res.status(500).json({
      error: `Ошибка записи файла ${DOMAINS_FILE}: ${writeError.message}`,
    });
  }
});

// API: Живой лог выполнения update-ai-router.sh (для опроса фронтендом)
app.get('/api/process-log', (req, res) => {
  const running = processStartedAt !== null && !processFinished && !processError;

  let logText = '';
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    if (processStartedAt !== null) {
      // Берём только строки текущего запуска: ищем последний разделитель/старт
      // не раньше момента запуска скрипта
      const startTs = new Date(processStartedAt - 5000);
      const stampRe = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/;
      const lines = content.split('\n');
      let startIdx = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(stampRe);
        if (m && new Date(m[1].replace(' ', 'T')) < startTs) {
          startIdx = i + 1;
          break;
        }
      }
      logText = lines.slice(startIdx).join('\n');
    } else {
      logText = content;
    }
  } catch {
    // Лог недоступен — отдаём то, что накопили в памяти
    logText = '';
  }

  if (logText.length > 20000) logText = logText.slice(-20000);

  res.json({
    running,
    finished: processFinished || processError !== null,
    ok: processFinished && processScriptExit === 0,
    exitCode: processScriptExit,
    error: processError,
    log: logText,
  });
});

// API: Получить текущее содержимое файла доменов
app.get('/api/domains', (req, res) => {
  if (!fs.existsSync(DOMAINS_FILE)) {
    return res.json({ content: '', exists: false });
  }

  try {
    const content = fs.readFileSync(DOMAINS_FILE, 'utf8');
    res.json({ content, exists: true });
  } catch (e) {
    res.status(500).json({ error: `Ошибка чтения файла: ${e.message}` });
  }
});

// API: Статус системы
app.get('/api/status', (req, res) => {
  const checks = {
    domainsFile: fs.existsSync(DOMAINS_FILE),
    scriptExists: fs.existsSync(SCRIPT_PATH),
    logFile: fs.existsSync(LOG_FILE),
  };

  let domainsCount = 0;
  if (checks.domainsFile) {
    try {
      const content = fs.readFileSync(DOMAINS_FILE, 'utf8');
      domainsCount = parseDomains(content).length;
    } catch (e) {
      // ignore
    }
  }

  res.json({
    ...checks,
    domainsCount,
  });
});

// API: Диагностика системы
app.get('/api/diagnose', (req, res) => {
  const DIAGNOSTIC_SCRIPT = '/usr/local/bin/check-vm-awg.sh';
  
  if (!fs.existsSync(DIAGNOSTIC_SCRIPT)) {
    return res.status(404).json({
      error: 'Скрипт диагностики не найден',
      log: `❌ Скрипт ${DIAGNOSTIC_SCRIPT} не существует`,
    });
  }

  const child = spawn(`sudo ${DIAGNOSTIC_SCRIPT} 2>&1`, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  let output = '';

  child.stdout.on('data', (data) => {
    const chunk = data.toString();
    output += chunk;
    process.stdout.write('[DIAG OUT] ' + chunk);
  });

  child.stderr.on('data', (data) => {
    const chunk = data.toString();
    output += chunk;
    process.stderr.write('[DIAG ERR] ' + chunk);
  });

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    console.error('Диагностика завершена по таймауту (60 сек)');
  }, 60000);

  child.on('close', (code) => {
    clearTimeout(timeout);
    
    if (code !== 0 && !output) {
      return res.status(500).json({
        error: `Диагностика завершилась с кодом: ${code}`,
        log: `❌ Диагностика завершилась с кодом: ${code}\nВывод отсутствует.`,
      });
    }

    res.json({
      success: code === 0,
      exitCode: code,
      log: output || 'Диагностика выполнена без вывода.',
    });
  });

  child.on('error', (err) => {
    clearTimeout(timeout);
    console.error(`Ошибка запуска диагностики: ${err.message}`);
    return res.status(500).json({
      error: `Ошибка запуска диагностики: ${err.message}`,
      log: `❌ Ошибка запуска: ${err.message}`,
    });
  });
});

// API: Обновление приложения
// Скрипт update.sh в конце перезапускает сам сервис (systemctl restart),
// поэтому HTTP-ответ отправляется СРАЗУ после запуска скрипта, а его вывод
// пишется в лог-файл. Фронтенд опрашивает /api/update-log до завершения.
const UPDATE_LOG_FILE = process.env.UPDATE_LOG_FILE || '/var/log/ai-router-update.log';
let updateRunning = false;

app.get('/api/update', (req, res) => {
  const UPDATE_SCRIPT = path.join(__dirname, '..', 'update.sh');

  if (!fs.existsSync(UPDATE_SCRIPT)) {
    return res.status(404).json({
      error: 'Скрипт обновления не найден',
      log: `❌ Скрипт ${UPDATE_SCRIPT} не существует`,
    });
  }

  if (updateRunning) {
    return res.status(409).json({
      error: 'Обновление уже запущено, дождитесь его завершения',
    });
  }

  const projectDir = path.join(__dirname, '..');

  // Пытаемся писать в лог-файл; если прав нет — пишем в локальный файл рядом с проектом
  let logPath = UPDATE_LOG_FILE;
  try {
    fs.writeFileSync(logPath, `===== Обновление начато: ${new Date().toISOString()} =====\n`);
  } catch {
    logPath = path.join(projectDir, 'update.log');
    fs.writeFileSync(logPath, `===== Обновление начато: ${new Date().toISOString()} =====\n`);
  }

  const child = spawn('bash', [UPDATE_SCRIPT], {
    env: {
      ...process.env,
      PATH: `${projectDir}/node_modules/.bin:${process.env.PATH}`,
    },
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  updateRunning = true;

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const handleData = (data) => {
    const chunk = data.toString();
    logStream.write(chunk);
    process.stdout.write('[UPDATE] ' + chunk);
  };
  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);

  child.on('close', (code) => {
    logStream.write(`\n===== Обновление завершено: код ${code}, ${new Date().toISOString()} =====\n`);
    logStream.end();
    updateRunning = false;
    console.log(`Обновление завершилось с кодом: ${code}`);
  });

  child.on('error', (err) => {
    logStream.write(`\n❌ Ошибка запуска update.sh: ${err.message}\n`);
    logStream.end();
    updateRunning = false;
  });

  // Ответ уходит ДО того, как скрипт успеет перезапустить сервис — 502 больше нет
  res.json({
    success: true,
    started: true,
    pid: child.pid,
    logFile: logPath,
    log: `🚀 Обновление запущено (PID ${child.pid}). Лог: ${logPath}\n`,
  });
});

// API: Ход выполнения обновления (читается из лог-файла, переживает рестарт сервиса)
app.get('/api/update-log', (req, res) => {
  const candidates = [UPDATE_LOG_FILE, path.join(__dirname, '..', 'update.log')];
  for (const p of candidates) {
    let content = '';
    try {
      content = fs.readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    const m = content.match(/===== Обновление завершено: код (\d+)/);
    const finished = Boolean(m);
    return res.json({
      running: !finished && updateRunning,
      finished,
      ok: finished ? Number(m[1]) === 0 : false,
      exitCode: finished ? Number(m[1]) : null,
      log: content.slice(-20000), // последние ~20 КБ лога
    });
  }
  res.json({ running: updateRunning, finished: false, ok: false, exitCode: null, log: '' });
});

// Раздача статики (фронтенд из ../dist/)
const staticDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('/*splat', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Router Manager запущен на порту ${PORT}`);
  console.log(`   Домены: ${DOMAINS_FILE}`);
  console.log(`   Скрипт: ${SCRIPT_PATH}`);
  console.log(`   Лог:    ${LOG_FILE}`);
});
