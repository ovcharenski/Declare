/**
 * Bot user-facing strings (ru/en) — plan §10 "Локализация". The language is
 * selected from the Telegram user's `language_code` (ru by default, en for
 * `en-*`). Kept as plain objects for zero dependency and simple typing.
 */

export type BotLanguage = "ru" | "en";

export interface BotStrings {
  welcome: string;
  about: string;
  sendSuggestion: string;
  cancel: string;
  back: string;
  sendMore: string;
  awaitingContent: string;
  awaitingTag: string;
  invalidContent: string;
  textTooLong: string;
  mediaTooLarge: string;
  photoTooLarge: string;
  videoTooLarge: string;
  tagSelected: (tagName: string) => string;
  suggestionSaved: (id: number) => string;
  suggestionDuplicate: (id: number) => string;
  botDisabled: string;
  banned: (reason: string, until: string | null) => string;
  rateLimited: (retryAfterSec: number) => string;
  duplicateContent: string;
  error: string;
  cancelled: string;
}

const ru: BotStrings = {
  welcome:
    "Привет! Я бот для предложений. Нажмите «Отправить предложение», чтобы поделиться идеей.",
  about:
    "Через меня можно отправить предложение команде: текст, фото или видео. Всё попадает к администраторам на модерацию.",
  sendSuggestion: "📝 Отправить предложение",
  cancel: "Отмена",
  back: "← Назад",
  sendMore: "Отправить ещё",
  awaitingContent:
    "Отправьте текст, фото или видео с вашим предложением. Подпись к медиа сохранится как текст.",
  awaitingTag: "Выберите тег для вашего предложения:",
  invalidContent: "Пожалуйста, отправьте текст, фото или видео.",
  textTooLong: "Текст слишком длинный (максимум 4096 символов).",
  mediaTooLarge: "Файл слишком большой.",
  photoTooLarge: "Фото слишком большое (максимум 10 МБ).",
  videoTooLarge: "Видео слишком большое (максимум 20 МБ).",
  tagSelected: (tagName) => `Тег: ${tagName}`,
  suggestionSaved: (id) => `Спасибо! Ваше предложение сохранено (№${id}).`,
  suggestionDuplicate: (id) => `Это предложение уже было сохранено (№${id}).`,
  botDisabled: "Приём предложений временно отключён.",
  banned: (reason, until) =>
    `Вы не можете отправлять предложения.${reason ? ` Причина: ${reason}` : ""}${
      until ? ` До: ${until}` : ""
    }`,
  rateLimited: (retryAfterSec) =>
    `Слишком часто. Попробуйте через ${Math.max(1, Math.ceil(retryAfterSec))} сек.`,
  duplicateContent: "Такое предложение уже было отправлено недавно.",
  error: "Произошла ошибка. Попробуйте ещё раз.",
  cancelled: "Действие отменено.",
};

const en: BotStrings = {
  welcome:
    'Hi! I\'m a suggestions bot. Tap "Send suggestion" to share an idea.',
  about:
    "You can send a suggestion to the team: text, photo or video. Everything goes to admins for moderation.",
  sendSuggestion: "📝 Send suggestion",
  cancel: "Cancel",
  back: "← Back",
  sendMore: "Send another",
  awaitingContent:
    "Send text, photo or video with your suggestion. A media caption is saved as text.",
  awaitingTag: "Choose a tag for your suggestion:",
  invalidContent: "Please send text, photo or video.",
  textTooLong: "Text is too long (max 4096 characters).",
  mediaTooLarge: "File is too large.",
  photoTooLarge: "Photo is too large (max 10 MB).",
  videoTooLarge: "Video is too large (max 20 MB).",
  tagSelected: (tagName) => `Tag: ${tagName}`,
  suggestionSaved: (id) => `Thanks! Your suggestion was saved (#${id}).`,
  suggestionDuplicate: (id) => `This suggestion was already saved (#${id}).`,
  botDisabled: "Suggestion intake is temporarily disabled.",
  banned: (reason, until) =>
    `You cannot send suggestions.${reason ? ` Reason: ${reason}` : ""}${
      until ? ` Until: ${until}` : ""
    }`,
  rateLimited: (retryAfterSec) =>
    `Too frequent. Try again in ${Math.max(1, Math.ceil(retryAfterSec))} sec.`,
  duplicateContent: "A similar suggestion was already sent recently.",
  error: "Something went wrong. Please try again.",
  cancelled: "Cancelled.",
};

const strings: Record<BotLanguage, BotStrings> = { ru, en };

/** Resolve language from a Telegram language_code (`en` for `en-*`, else ru). */
export function languageFromCode(code?: string): BotLanguage {
  if (code && code.toLowerCase().startsWith("en")) return "en";
  return "ru";
}

export function t(lang: BotLanguage): BotStrings {
  return strings[lang];
}
