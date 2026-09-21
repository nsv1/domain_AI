import { useState, useRef, useEffect } from 'react';

// Используем относительные пути — фронтенд раздаётся тем же сервером
const API_URL = '';

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
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = idle, 1-5 = active step, 6 = all done
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [domainsSource, setDomainsSource] = useState<'file' | 'default' | 'loading'>('loading');
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
          setDomainsSource('file');
        } else {
          // Файл не существует — показываем пример
          setDomains(DEFAULT_DOMAINS);
          setDomainsSource('default');
        }
      } else {
        setDomains(DEFAULT_DOMAINS);
        setDomainsSource('default');
      }
    } catch (e) {
      // API недоступен — показываем пример
      setDomains(DEFAULT_DOMAINS);
      setDomainsSource('default');
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

    setError('');
    setSuccess('');
    setLog('');
    setCurrentStep(0);

    // Последовательная анимация этапов
    const stepTimers: ReturnType<typeof setTimeout>[] = [];
    
    const startSteps = () => {
      stepTimers.push(setTimeout(() => setCurrentStep(1), 0));      // Сохранение доменов
      stepTimers.push(setTimeout(() => setCurrentStep(2), 500));    // Запуск скрипта
      stepTimers.push(setTimeout(() => setCurrentStep(3), 2000));   // Резолвинг DNS
      stepTimers.push(setTimeout(() => setCurrentStep(4), 4000));   // Обновление маршрутов
      stepTimers.push(setTimeout(() => setCurrentStep(5), 5500));   // Перезагрузка dnsmasq
    };

    const clearSteps = () => {
      stepTimers.forEach(timer => clearTimeout(timer));
    };

    startSteps();

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
      clearSteps();
      setCurrentStep(6); // Все этапы завершены
      // Через 2 секунды сбрасываем в idle
      setTimeout(() => setCurrentStep(0), 2000);
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
                  {domainsSource === 'file' && (
                    <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <i className="fas fa-database text-[8px]"></i>
                      из файла
                    </span>
                  )}
                  {domainsSource === 'default' && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <i className="fas fa-exclamation-triangle text-[8px]"></i>
                      шаблон
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded">
                  {domainCount} доменов
                </span>
              </div>
              <div className="p-4">
                {domainsSource === 'default' && (
                  <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                    <i className="fas fa-exclamation-triangle text-amber-400 mt-0.5 text-sm"></i>
                    <div className="text-xs text-amber-300">
                      <p className="font-semibold mb-1">API сервер недоступен или файл не найден</p>
                      <p className="text-amber-400/80">Отображается шаблон. Проверьте, что сервер запущен (<code className="bg-slate-700/50 px-1 rounded">node server.js</code>) и файл <code className="bg-slate-700/50 px-1 rounded">/etc/ai-domains.list</code> существует.</p>
                    </div>
                  </div>
                )}
                <textarea
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  placeholder={`Введите список доменов, например:\n\n# ============================================\n# OpenAI (ChatGPT, DALL-E, GPT API)\n# ============================================\nopenai.com\nchat.openai.com\nchatgpt.com\napi.openai.com\n---`}
                  className="w-full h-96 bg-slate-900/80 border border-slate-600/50 rounded-lg p-4 text-sm font-mono text-green-300 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all overflow-y-auto"
                  spellCheck={false}
                />
              </div>
              <div className="px-4 py-3 border-t border-slate-700/50 flex items-center gap-3">
                <button
                  onClick={handleProcess}
                  disabled={(currentStep > 0 && currentStep < 6) || !domains.trim()}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
                    (currentStep > 0 && currentStep < 6)
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40'
                  }`}
                >
                  {(currentStep > 0 && currentStep < 6) ? (
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
                  disabled={currentStep > 0 && currentStep < 6}
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
                  status={currentStep === 6 || currentStep > 1 ? 'done' : currentStep === 1 ? 'active' : 'idle'}
                />
                <ProcessStep
                  step={2}
                  title="Запуск скрипта"
                  description="sudo /usr/local/bin/update-ai-router.sh"
                  status={currentStep === 6 || currentStep > 2 ? 'done' : currentStep === 2 ? 'active' : 'idle'}
                />
                <ProcessStep
                  step={3}
                  title="Резолвинг DNS"
                  description="dig @127.0.0.1 +short"
                  status={currentStep === 6 || currentStep > 3 ? 'done' : currentStep === 3 ? 'active' : 'idle'}
                />
                <ProcessStep
                  step={4}
                  title="Обновление маршрутов"
                  description="ip route replace ... dev awg0"
                  status={currentStep === 6 || currentStep > 4 ? 'done' : currentStep === 4 ? 'active' : 'idle'}
                />
                <ProcessStep
                  step={5}
                  title="Перезагрузка dnsmasq"
                  description="systemctl reload dnsmasq"
                  status={currentStep === 6 || currentStep > 5 ? 'done' : currentStep === 5 ? 'active' : 'idle'}
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
function ProcessStep({ step, title, description, status }: {
  step: number;
  title: string;
  description: string;
  status: 'idle' | 'active' | 'done';
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
      status === 'active' ? 'bg-blue-500/10 border border-blue-500/20' :
      status === 'done' ? 'bg-green-500/10 border border-green-500/20' :
      'bg-slate-800/30'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        status === 'active'
          ? 'bg-blue-500/20 text-blue-400'
          : status === 'done'
          ? 'bg-green-500/20 text-green-400'
          : 'bg-slate-700/50 text-slate-500'
      }`}>
        {status === 'active' ? (
          <i className="fas fa-spinner fa-spin text-[10px]"></i>
        ) : status === 'done' ? (
          <i className="fas fa-check text-[10px]"></i>
        ) : (
          step
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${
          status === 'active' ? 'text-blue-300' :
          status === 'done' ? 'text-green-300' :
          'text-slate-400'
        }`}>
          {title}
        </p>
        <p className="text-[10px] text-slate-500 truncate font-mono">{description}</p>
      </div>
    </div>
  );
}

export default App;
