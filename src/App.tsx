import { useState } from 'react'

type Step = {
  id: number
  title: string
  description: string
  solution: string
  icon: string
  checked: boolean
}

const curlCommand = `curl -X POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation \\
-H "Authorization: Bearer YOUR_API_KEY" \\
-H "Content-Type: application/json" \\
-d '{"model":"qwen-coder-plus","input":{"prompt":"hello"}}'`

function App() {
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 1,
      title: 'Проверьте интернет-соединение',
      description: 'Убедитесь, что у вас стабильное подключение к интернету. Попробуйте открыть другие сайты.',
      solution: 'Перезагрузите роутер, проверьте Wi-Fi или переключитесь на мобильный интернет. Убедитесь, что DNS работает корректно.',
      icon: '🌐',
      checked: false,
    },
    {
      id: 2,
      title: 'Проверьте API-ключ',
      description: 'Возможно, ваш API-ключ истёк, недействителен или превышен лимит запросов.',
      solution: 'Зайдите в панель управления (DashScope / Alibaba Cloud) и проверьте статус ключа. Сгенерируйте новый ключ при необходимости.',
      icon: '🔑',
      checked: false,
    },
    {
      id: 3,
      title: 'Проверьте доступность сервиса',
      description: 'Сервис Qwen3-Coder может быть временно недоступен из-за технических работ или перегрузки серверов.',
      solution: 'Проверьте статус-страницу Alibaba Cloud / DashScope. Подождите 5-10 минут и попробуйте снова.',
      icon: '🔧',
      checked: false,
    },
    {
      id: 4,
      title: 'Проверьте баланс аккаунта',
      description: 'Если вы используете платный API, убедитесь что на аккаунте достаточно средств.',
      solution: 'Пополните баланс в личном кабинете Alibaba Cloud. Бесплатный лимит мог быть исчерпан.',
      icon: '💰',
      checked: false,
    },
    {
      id: 5,
      title: 'Проверьте модель и параметры',
      description: 'Неправильное имя модели или параметры запроса могут вызвать ошибку подключения.',
      solution: 'Убедитесь, что имя модели корректно (например, "qwen-coder-plus" или "qwen3-coder"). Проверьте формат запроса по документации.',
      icon: '⚙️',
      checked: false,
    },
    {
      id: 6,
      title: 'Проверьте CORS и прокси',
      description: 'Если запрос идёт из браузера, может блокироваться CORS. Если через прокси — проверьте его настройки.',
      solution: 'Добавьте правильные CORS-заголовки на сервере. Если используете прокси — убедитесь что он пропускает HTTPS-запросы к API.',
      icon: '🛡️',
      checked: false,
    },
    {
      id: 7,
      title: 'Проверьте rate limiting',
      description: 'Превышение лимита запросов в минуту может привести к временной блокировке.',
      solution: 'Подождите 1 минуту. Добавьте задержки между запросами или реализуйте очередь. Проверьте лимиты в документации.',
      icon: '⏱️',
      checked: false,
    },
    {
      id: 8,
      title: 'Региональные ограничения',
      description: 'Сервис может быть недоступен в вашем регионе или заблокирован провайдером.',
      solution: 'Попробуйте использовать VPN. Проверьте, доступен ли сервис из вашего региона. Некоторые модели доступны только в определённых регионах.',
      icon: '🗺️',
      checked: false,
    },
  ])

  const toggleStep = (id: number) => {
    setSteps(steps.map(step =>
      step.id === id ? { ...step, checked: !step.checked } : step
    ))
  }

  const checkedCount = steps.filter(s => s.checked).length
  const progress = Math.round((checkedCount / steps.length) * 100)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🚨</div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                Ошибка подключения к Qwen3-Coder
              </h1>
              <p className="text-slate-400 mt-1 text-sm md:text-base">
                «Oops! There was an issue connecting to Qwen3-Coder. Неизвестная ошибка»
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Error explanation */}
        <section className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <span>💡</span> Что означает эта ошибка?
          </h2>
          <p className="text-slate-300 leading-relaxed">
            Эта ошибка означает, что клиент (приложение, IDE или браузер) не смог установить соединение
            с API модели <strong className="text-purple-300">Qwen3-Coder</strong> от Alibaba Cloud.
            Причин может быть множество — от проблем с сетью до некорректных настроек API.
            Пройдитесь по чеклисту ниже, чтобы найти и устранить проблему.
          </p>
        </section>

        {/* Progress bar */}
        <section className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-slate-400">Прогресс диагностики</span>
            <span className="text-sm font-mono text-purple-300">{checkedCount}/{steps.length} проверено</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>

        {/* Checklist */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>📋</span> Чеклист для решения проблемы
          </h2>

          {steps.map((step) => (
            <div
              key={step.id}
              className={`p-5 rounded-xl border transition-all duration-300 cursor-pointer hover:scale-[1.01] ${
                step.checked
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-white/5 border-white/10 hover:border-purple-500/30'
              }`}
              onClick={() => toggleStep(step.id)}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                    step.checked
                      ? 'bg-green-500 border-green-400'
                      : 'border-slate-500 hover:border-purple-400'
                  }`}>
                    {step.checked ? '✓' : step.id}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{step.icon}</span>
                    <h3 className={`font-semibold text-lg ${step.checked ? 'text-green-300 line-through' : 'text-white'}`}>
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-3">{step.description}</p>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <p className="text-sm text-slate-300">
                      <span className="text-green-400 font-semibold">Решение: </span>
                      {step.solution}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Quick commands */}
        <section className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>⚡</span> Быстрая диагностика (команды)
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-400 mb-1">Проверка доступности API:</p>
              <pre className="p-3 rounded-lg bg-black/40 text-green-300 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {curlCommand}
              </pre>
            </div>
            <div>
              <p className="text-sm text-slate-400 mb-1">Проверка DNS:</p>
              <code className="block p-3 rounded-lg bg-black/40 text-green-300 text-sm font-mono overflow-x-auto">
                nslookup dashscope.aliyuncs.com
              </code>
            </div>
            <div>
              <p className="text-sm text-slate-400 mb-1">Проверка соединения:</p>
              <code className="block p-3 rounded-lg bg-black/40 text-green-300 text-sm font-mono overflow-x-auto">
                ping -c 4 dashscope.aliyuncs.com
              </code>
            </div>
          </div>
        </section>

        {/* Common causes table */}
        <section className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>📊</span> Частые причины ошибки
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-2 text-slate-400 font-medium">Код ошибки</th>
                  <th className="text-left py-3 px-2 text-slate-400 font-medium">Причина</th>
                  <th className="text-left py-3 px-2 text-slate-400 font-medium">Что делать</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-white/5">
                  <td className="py-3 px-2 font-mono text-red-300">401</td>
                  <td className="py-3 px-2">Неверный API-ключ</td>
                  <td className="py-3 px-2">Проверьте и обновите ключ</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-2 font-mono text-orange-300">403</td>
                  <td className="py-3 px-2">Нет доступа к модели</td>
                  <td className="py-3 px-2">Активируйте модель в консоли</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-2 font-mono text-yellow-300">429</td>
                  <td className="py-3 px-2">Превышен лимит запросов</td>
                  <td className="py-3 px-2">Подождите или увеличьте квоту</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-2 font-mono text-blue-300">500</td>
                  <td className="py-3 px-2">Внутренняя ошибка сервера</td>
                  <td className="py-3 px-2">Подождите и повторите</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-2 font-mono text-purple-300">503</td>
                  <td className="py-3 px-2">Сервис временно недоступен</td>
                  <td className="py-3 px-2">Проверьте статус-страницу</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-mono text-pink-300">—</td>
                  <td className="py-3 px-2">Таймаут соединения</td>
                  <td className="py-3 px-2">Проверьте сеть / VPN / прокси</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Links */}
        <section className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>🔗</span> Полезные ссылки
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <a
              href="https://help.aliyun.com/zh/model-studio/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors flex items-center gap-2"
            >
              <span>📖</span>
              <span className="text-purple-300 text-sm">Документация DashScope</span>
            </a>
            <a
              href="https://dashscope.console.aliyun.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center gap-2"
            >
              <span>🔑</span>
              <span className="text-blue-300 text-sm">Консоль DashScope</span>
            </a>
            <a
              href="https://status.alibabacloud.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors flex items-center gap-2"
            >
              <span>📊</span>
              <span className="text-green-300 text-sm">Статус сервисов Alibaba Cloud</span>
            </a>
            <a
              href="https://github.com/QwenLM/Qwen2.5-Coder"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-colors flex items-center gap-2"
            >
              <span>💻</span>
              <span className="text-orange-300 text-sm">Qwen-Coder на GitHub</span>
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pb-8 text-center text-slate-500 text-sm">
          <p>Если ничего не помогло — попробуйте обратиться в поддержку Alibaba Cloud или на форум сообщества.</p>
          <p className="mt-2">💬 Часто проблема решается простой перезагрузкой приложения или обновлением API-ключа.</p>
        </footer>
      </main>
    </div>
  )
}

export default App
