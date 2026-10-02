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
app.get('/api/update', (req, res) => {
  const UPDATE_SCRIPT = path.join(__dirname, '..', 'update.sh');
  
  if (!fs.existsSync(UPDATE_SCRIPT)) {
    return res.status(404).json({
      error: 'Скрипт обновления не найден',
      log: `❌ Скрипт ${UPDATE_SCRIPT} не существует`,
    });
  }

  const projectDir = path.join(__dirname, '..');
  const child = spawn('bash', [UPDATE_SCRIPT], {
    env: { 
      ...process.env,
      PATH: `${projectDir}/node_modules/.bin:${process.env.PATH}`
    },
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';

  const handleData = (data) => {
    const chunk = data.toString();
    output += chunk;
    process.stdout.write('[UPDATE] ' + chunk);
  };

  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    console.error('Обновление завершено по таймауту (300 сек)');
  }, 300000);

  child.on('close', (code) => {
    clearTimeout(timeout);
    
    if (code !== 0 && !output) {
      return res.status(500).json({
        error: `Обновление завершилось с кодом: ${code}`,
        log: `❌ Обновление завершилось с кодом: ${code}\nВывод отсутствует.`,
      });
    }

    res.json({
      success: code === 0,
      exitCode: code,
      log: output || 'Обновление выполнено без вывода.',
    });
  });

  child.on('error', (err) => {
    clearTimeout(timeout);
    console.error(`Ошибка запуска обновления: ${err.message}`);
    return res.status(500).json({
      error: `Ошибка запуска обновления: ${err.message}`,
      log: `❌ Ошибка запуска: ${err.message}`,
    });
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
