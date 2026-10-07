# domain_AI

## Доступ к приватному репозиторию (nsv1/domain_AI)

Репозиторий может оставаться **приватным** — проблема не в этом, а в отсутствии у сервиса (например, code.qwen.ai / Qwen Code) доступа к нему. По умолчанию такие облачные агенты работают только с публичными репозиториями либо с приватными, если явно предоставлен токен доступа.

### Вариант 1: Personal Access Token (рекомендуется)

1. Создайте токен на GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic)**
   - Область видимости: `repo` (полный доступ к приватным репозиториям)
2. Клонируйте с токеном:

```bash
git clone https://<TOKEN>@github.com/nsv1/domain_AI.git
```

3. Либо сохраните токен в credential helper, чтобы не вводить его каждый раз:

```bash
git config --global credential.helper store
echo "https://<TOKEN>@github.com" > ~/.git-credentials
chmod 600 ~/.git-credentials
```

#### Как передать токен веб-версии code.qwen.ai

1. **Создайте Fine-grained token** (безопаснее classic):  
   GitHub → профиль → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**  
   - Resource owner: `nsv1` (или ваш логин)  
   - Repository access: **Only select repositories → nsv1/domain_AI**  
   - Permissions: **Contents → Read-only** (+ Metadata Read-only, автоматически)  
   - Скопируйте токен сразу (`github_pat_...`) — он показывается один раз.

2. **Войдите в веб-интерфейс code.qwen.ai** и найдите место ввода токена:
   - Обычно при подключении репозитория есть поле **«Repository URL / Token»**, **«GitHub Access Token»** или кнопка **«Connect GitHub»**.
   - Вставьте токен в поле Token, в качестве URL укажите `https://github.com/nsv1/domain_AI`.

3. **Если поля для токена нет** — сервис не поддерживает приватные репозитории напрямую. Обходной путь: локальный клон с токеном + загрузка файлов в чат/рабочее пространство агента:

```bash
git clone https://x-access-token:<TOKEN>@github.com/nsv1/domain_AI.git
cd domain_AI && zip -r ../domain_AI.zip . -x '.git/*'
# затем прикрепите domain_AI.zip к диалогу в code.qwen.ai
```

4. **Безопасность**: используйте минимальные права (Read-only), ограниченный срок действия (30–90 дней), отзывайте токен в Settings → Tokens после завершения работы. Не коммитьте токен в код!

Для SSH-доступа (альтернатива HTTPS):

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
# Добавьте ключ на GitHub: Settings → SSH and GPG keys
git clone git@github.com:nsv1/domain_AI.git
```

### Вариант 2: GitHub Deploy Key (только для конкретного репозитория)

1. Сгенерируйте ключ и добавьте **публичную** часть в:
   **Реппозиторий → Settings → Deploy keys** (с правом Read access).
2. Клонируйте через SSH — доступ будет только к этому репозиторию, что безопаснее токена.

### Вариант 3: OAuth App / GitHub App

Если интеграция с code.qwen.ai поддерживает подключение аккаунта GitHub — авторизуйте приложение через него, тогда оно получит доступ к приватным репозиториям от вашего имени. Проверьте документацию сервиса: некоторые AI-ассистенты работают **только с публичными репозиториями**.

### Временное решение: сделать репозиторий публичным

Если ни один из вариантов недоступен:

**Repository → Settings → Danger Zone → Change visibility → Make public**

⚠️ Учтите: код станет виден всем. Перед этим убедитесь, что в истории коммитов нет секретов (токены, пароли, API-ключи). Если они есть — сначала очистите историю (`git filter-repo`), затем меняйте видимость.

### Как отключить и заново подключить репозиторий к чату

**Отключение (на стороне сервиса):**
1. В интерфейсе code.qwen.ai откройте настройки подключённого проекта/чата и найдите раздел с интеграцией GitHub (Connected repositories / Integrations).
2. Нажмите **Disconnect / Unlink** рядом с `nsv1/domain_AI`. Если такой кнопки нет — просто начните новый чат: привязка репозитория обычно живёт в рамках одного диалога.
3. Обязательно отзовите выданный токен, если больше не планируете его использовать: GitHub → Settings → Developer settings → Personal access tokens → выберите токен → **Delete/Revoke**. Это гарантирует, что сервис потеряет доступ к репозиторию независимо от своего кэша.

**Повторное подключение:**
1. Создайте новый Fine-grained token (старый после отзыва уже не подойдёт) — см. инструкцию выше.
2. В новом чате code.qwen.ai укажите URL `https://github.com/nsv1/domain_AI` и вставьте свежий токен.
3. Если сервис показывает старую версию кода (кэш), принудительно обновите клон локально и пересоберите архив:

```bash
cd domain_AI
git fetch origin && git reset --hard origin/main
zip -r ../domain_AI.zip . -x '.git/*'
# затем загрузите domain_AI.zip в чат заново
```

### Ответ на ваш вопрос

Скорее всего, code.qwen.ai действительно не работает с приватными репозиториями без явной авторизации — это ограничение сервиса, а не проблема репозитория. Используйте токен (Вариант 1) или сделайте репозиторий публичным (Вариант 3), если секреты в коде отсутствуют.
