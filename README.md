# Declare

Платформа сбора предложений: Telegram-бот, веб-админ-панель и единый backend (SQLite).

## Запуск (development)

```bash
npm install
npm run dev
```

Откройте `http://127.0.0.1:5784`.

В development включён режим `MOCK=true` — авторизация происходит через dev-экран выбора роли, без обращения к Vare OAuth. Для подключения реального входа через Vare заполните `.env` (см. `.env.example`) и снимите `MOCK`.

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run dev` | app + Vite HMR |
| `npm run build` | сборка SPA + server |
| `npm run start` | прод app |
| `npm run check` | TypeScript |
| `npm test` | Vitest |

## Документация

Полный план и архитектура — в `docs/declare-plan.md`. Исходная база — `NS-Staff-Cloud` (read-only, не изменяется).
