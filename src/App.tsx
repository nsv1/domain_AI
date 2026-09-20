import { useState, useRef, useEffect } from 'react';

const API_URL = 'http://localhost:3001';

interface SystemStatus {
  domainsFile: boolean;
  scriptExists: boolean;
  logFile: boolean;
  domainsCount: number;
}

const DEFAULT_DOMAINS = `# ============================================
# OpenAI (ChatGPT, DALL-E, GPT API)
# ============================================
openai.com
chat.openai.com
chatgpt.com
chatgpt.live
api.openai.com
platform.openai.com
---`;

function App() {
  const [domains, setDomains] = useState<string>('');
  const [log, setLog] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const logRef = useRef<HTMLPreElement>(null);

  // Загрузка статуса и содержимого файла доменов при монтировании
  useEffect(() => {
    fetchStatus();
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const response = await fetch(`${API_URL}/api/domains`);
      if (response.ok) {
        const data = await response.json();
        if (data.exists && data.content) {
          setDomains(data.content);
        } else {
          // Файл не существует — показываем пример
          setDomains(DEFAULT_DOMAINS);
        }
      } else {
        setDomains(DEFAULT_DOMAINS);
      }
    } catch (e) {
      // API недоступен — показываем пример
      setDomains(DEFAULT_DOMAINS);
    }
  };

  // Автопрокрутка лога
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (e) {
      // Сервер может быть недоступен
      console.log('API сервер недоступен');
    }
  };

  const handleProcess = async () => {
    if (!domains.trim()) {
      setError('Введите список доменов для обработки');
      return;
    }

    setIsProcessing(true);
    setError('');
    setSuccess('');
    setLog('');

    try {
      const response = await fetch(`${API_URL}/api/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domains }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Произошла ошибка при обработке');
        if (data.log) {
          setLog(data.log);
        }
      } else {
        setSuccess(`✅ Обработка завершена. Доменов: ${data.domainsCount}`);
        setLog(data.log || 'Скрипт выполнен успешно.');
        fetchStatus();
      }
    } catch (e: any) {
      setError(`Ошибка подключения к серверу: ${e.message}. Убедитесь, что API сервер запущен (node server.js)`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setDomains('');
    setLog('');
    setError('');
    setSuccess('');
  };

  const domainCount = domains
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l !== '---').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <i className="fas fa-route text-white text-lg"></i>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI Router Manager</h1>
              <p className="text-xs text-slate-400">Управление маршрутизацией AI-доменов</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {status && (
              <div className="flex items-center gap-3 text-xs">
                <StatusBadge
                  label="Домены"
                  ok={status.domainsFile}
                  detail={`${status.domainsCount} шт.`}
                />
                <StatusBadge
                  label="Скрипт"
                  ok={status.scriptExists}
                />
                <StatusBadge
                  label="Лог"
                  ok={status.logFile}
                />
              </div>
            )}
            {!status && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <i className="fas fa-exclamation-triangle"></i>
                API недоступен
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Domains Input */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-file-alt text-blue-400"></i>
                  <h2 className="font-semibold text-white">Загрузка доменов</h2>
                </div>
                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded">
                  {domainCount} доменов
                </span>
              </div>
              <div className="p-4">
                <textarea
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  placeholder={`Введите список доменов, например:\n\n# ============================================\n# OpenAI (ChatGPT, DALL-E, GPT API)\n# ============================================\nopenai.com\nchat.openai.com\nchatgpt.com\napi.openai.com\n---`}
                  className="w-full min-h-[600px] bg-slate-900/80 border border-slate-600/50 rounded-lg p-4 text-sm font-mono text-green-300 placeholder-slate-500 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  spellCheck={false}
                />
              </div>
              <div className="px-4 py-3 border-t border-slate-700/50 flex items-center gap-3">
                <button
                  onClick={handleProcess}
                  disabled={isProcessing || !domains.trim()}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
                    isProcessing
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Обработка...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-play"></i>
                      Обработать
                    </>
                  )}
                </button>
                <button
                  onClick={handleClear}
                  disabled={isProcessing}
                  className="px-4 py-3 rounded-lg font-semibold text-sm bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white transition-all border border-slate-600/30"
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>

            {/* Info Panel */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <i className="fas fa-info-circle text-blue-400"></i>
                Информация
              </h3>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li className="flex items-start gap-2">
                  <i className="fas fa-check text-green-400 mt-0.5"></i>
                  <span>Домены сохраняются в <code className="text-blue-300 bg-slate-700/50 px-1 rounded">/etc/ai-domains.list</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fas fa-check text-green-400 mt-0.5"></i>
                  <span>Запускается скрипт <code className="text-blue-300 bg-slate-700/50 px-1 rounded">sudo /usr/local/bin/update-ai-router.sh</code></span>
                </li>

                <li className="flex items-start gap-2">
                  <i className="fas fa-check text-green-400 mt-0.5"></i>
                  <span>Результат записывается в <code className="text-blue-300 bg-slate-700/50 px-1 rounded">/var/log/ai-router.log</code></span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column - Log Output */}
          <div className="space-y-4">
            {/* Messages */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <i className="fas fa-exclamation-circle text-red-400 mt-0.5"></i>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-start gap-3">
                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                <p className="text-sm text-green-300">{success}</p>
              </div>
            )}

            {/* Log Panel */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fas fa-terminal text-green-400"></i>
                  <h2 className="font-semibold text-white">Лог</h2>
                </div>
                {log && (
                  <button
                    onClick={() => setLog('')}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    <i className="fas fa-times"></i> Очистить
                  </button>
                )}
              </div>
              <div className="p-4">
                <pre
                  ref={logRef}
                  className="w-full h-96 bg-slate-900/80 border border-slate-600/50 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap break-all"
                >
                  {log || (
                    <span className="text-slate-500 italic">
                      Здесь будет отображаться лог выполнения скрипта...
                    </span>
                  )}
                </pre>
              </div>
            </div>

            {/* Process Steps */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <i className="fas fa-list-ol text-purple-400"></i>
                Этапы обработки
              </h3>
              <div className="space-y-2">
                <ProcessStep
                  step={1}
                  title="Сохранение доменов"
                  description="/etc/ai-domains.list"
                  active={isProcessing}
                />
                <ProcessStep
                  step={2}
                  title="Запуск скрипта"
                  description="sudo /usr/local/bin/update-ai-router.sh"
                  active={isProcessing}
                />
                <ProcessStep
                  step={3}
                  title="Резолвинг DNS"
                  description="dig @127.0.0.1 +short"
                  active={isProcessing}
                />
                <ProcessStep
                  step={4}
                  title="Обновление маршрутов"
                  description="ip route replace ... dev awg0"
                  active={isProcessing}
                />
                <ProcessStep
                  step={5}
                  title="Перезагрузка dnsmasq"
                  description="systemctl reload dnsmasq"
                  active={isProcessing}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/30 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-slate-500">
          <span>AI Router Manager v1.0</span>
          <span>AmneziaWG + dnsmasq + BGP</span>
        </div>
      </footer>
    </div>
  );
}

// Компонент статуса
function StatusBadge({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`}></div>
      <span className="text-slate-400">{label}</span>
      {detail && <span className="text-slate-500">({detail})</span>}
    </div>
  );
}

// Компонент этапа обработки
function ProcessStep({ step, title, description, active }: {
  step: number;
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
      active ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-slate-800/30'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        active
          ? 'bg-blue-500/20 text-blue-400'
          : 'bg-slate-700/50 text-slate-500'
      }`}>
        {active ? <i className="fas fa-spinner fa-spin text-[10px]"></i> : step}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${active ? 'text-blue-300' : 'text-slate-400'}`}>
          {title}
        </p>
        <p className="text-[10px] text-slate-500 truncate font-mono">{description}</p>
      </div>
    </div>
  );
}

export default App;
