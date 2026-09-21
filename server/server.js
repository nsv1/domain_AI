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

    // Таймаут 120 секунд
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      console.error('Скрипт завершён по таймауту (120 сек)');
    }, 120000);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        console.error(`Скрипт завершился с кодом: ${code}`);
        
        let errorLog = `❌ Скрипт завершился с кодом: ${code}\n\n`;
        if (output) errorLog += output;
        else errorLog += '⚠️ Скрипт завершился с ошибкой без вывода.';
        
        return res.status(500).json({
          error: `Скрипт завершился с кодом: ${code}`,
          log: errorLog,
        });
      }

      // Проверяем output на пустоту
      if (!output || output.trim() === '') {
        const warningLog = '⚠️ Скрипт выполнен успешно, но вывод пуст. Возможно, скрипт не выводит данные или возникла проблема с буферизацией.';
        
        return res.json({
          success: true,
          domainsCount: parsedDomains.length,
          log: warningLog,
        });
      }

      // Возвращаем комбинированный вывод
      res.json({
        success: true,
        domainsCount: parsedDomains.length,
        log: output,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Ошибка запуска скрипта: ${err.message}`);
      return res.status(500).json({
        error: `Ошибка запуска скрипта: ${err.message}`,
        log: `❌ Ошибка запуска скрипта: ${err.message}\n\n${output || 'Вывод отсутствует.'}`,
      });
    });
  } catch (writeError) {
    console.error(`Ошибка записи файла: ${writeError.message}`);
    return res.status(500).json({
      error: `Ошибка записи файла ${DOMAINS_FILE}: ${writeError.message}`,
    });
  }
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
