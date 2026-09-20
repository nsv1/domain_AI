import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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

    exec(`sudo ${SCRIPT_PATH}`, { timeout: 120000 }, (error, stdout, stderr) => {
      // Логируем вывод скрипта в консоль сервера
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      if (error) {
        console.error(`Ошибка выполнения скрипта: ${error.message}`);
        return res.status(500).json({
          error: `Ошибка выполнения скрипта: ${error.message}`,
          log: stdout || stderr || 'Скрипт завершился с ошибкой без вывода.',
        });
      }

      // Возвращаем stdout текущего запуска скрипта как лог
      res.json({
        success: true,
        domainsCount: parsedDomains.length,
        log: stdout || 'Скрипт выполнен без вывода.',
      });
    });
  } catch (writeError) {
    console.error(`Ошибка записи файла: ${writeError.message}`);
    return res.status(500).json({
      error: `Ошибка записи файла ${DOMAINS_FILE}: ${writeError.message}`,
    });
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
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI Router Manager запущен на порту ${PORT}`);
  console.log(`   Домены: ${DOMAINS_FILE}`);
  console.log(`   Скрипт: ${SCRIPT_PATH}`);
  console.log(`   Лог:    ${LOG_FILE}`);
});
