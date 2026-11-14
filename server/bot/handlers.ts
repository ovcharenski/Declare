import type { Bot, Context } from "grammy";
import type { ReplyKeyboardMarkup } from "grammy/types";
import { config } from "../config";
import { logger } from "../logger";
import { botApi, BotApiError } from "./apiClient";
import { languageFromCode, t, type BotLanguage } from "./i18n";
import {
  mainReplyKeyboard,
  cancelReplyKeyboard,
  replyKeyboard,
  tagPickerKeyboard,
  SEND_SUGGESTION,
  ABOUT,
  CANCEL,
  TAG_PREFIX,
  PAGE_PREFIX,
} from "./keyboards";
import { getSession, updateSession, clearSession } from "./session";

const MAX_TEXT_LENGTH = 4096;

function lang(ctx: Context): BotLanguage {
  return languageFromCode(ctx.from?.language_code);
}

function s(ctx: Context) {
  return t(lang(ctx));
}

/** Extract all media from a message (photo → largest, video, etc.). */
function extractMedia(ctx: Context) {
  const media: {
    kind: "photo" | "video";
    fileId: string;
    fileUniqueId: string | null;
    width?: number;
    height?: number;
    durationSec?: number;
    sizeBytes?: number;
    mimeType?: string;
  }[] = [];

  const msg = ctx.message;
  if (!msg) return media;

  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    media.push({
      kind: "photo",
      fileId: largest.file_id,
      fileUniqueId: largest.file_unique_id ?? null,
      width: largest.width,
      height: largest.height,
      sizeBytes: largest.file_size,
    });
  }

  if (msg.video) {
    media.push({
      kind: "video",
      fileId: msg.video.file_id,
      fileUniqueId: msg.video.file_unique_id ?? null,
      width: msg.video.width,
      height: msg.video.height,
      durationSec: msg.video.duration,
      sizeBytes: msg.video.file_size,
      mimeType: msg.video.mime_type,
    });
  }

  return media;
}

/** Size guards per plan §10 (photo ≤10MB, video ≤20MB). */
function validateMediaSize(ctx: Context, media: ReturnType<typeof extractMedia>): string | null {
  const maxPhoto = config.mediaLimits.maxPhotoMb * 1024 * 1024;
  const maxVideo = config.mediaLimits.maxVideoMb * 1024 * 1024;

  for (const m of media) {
    if (m.kind === "photo" && m.sizeBytes && m.sizeBytes > maxPhoto) {
      return s(ctx).photoTooLarge;
    }
    if (m.kind === "video" && m.sizeBytes && m.sizeBytes > maxVideo) {
      return s(ctx).videoTooLarge;
    }
  }
  return null;
}

async function replyText(
  ctx: Context,
  text: string,
  keyboard?: ReplyKeyboardMarkup,
) {
  await ctx.reply(text, keyboard ? { reply_markup: keyboard } : {});
}

export function registerHandlers(bot: Bot): void {
  // /start — sync the user and greet (plan §10 scenario 1).
  bot.command("start", async (ctx) => {
    await syncUserFromCtx(ctx);
    const strings = s(ctx);
    await replyText(ctx, strings.welcome, replyKeyboard(mainReplyKeyboard(strings)));
  });

  // "О боте" / "About".
  bot.hears(ABOUT, async (ctx) => {
    await replyText(ctx, s(ctx).about);
  });

  // Main menu "Отправить предложение".
  bot.hears(SEND_SUGGESTION, async (ctx) => {
    const strings = s(ctx);
    updateSession(chatId(ctx), { state: "awaiting_content", text: null, media: [], contentMessageId: null, tagPage: 0 });
    await replyText(ctx, strings.awaitingContent, replyKeyboard(cancelReplyKeyboard(strings)));
  });

  // Cancel anywhere in the flow.
  bot.hears(CANCEL, async (ctx) => {
    clearSession(chatId(ctx));
    const strings = s(ctx);
    await replyText(ctx, strings.cancelled, replyKeyboard(mainReplyKeyboard(strings)));
  });

  // Content message (text/photo/video) while awaiting content.
  bot.on("message", async (ctx) => {
    const session = getSession(chatId(ctx));

    if (session.state === "awaiting_content") {
      await handleContent(ctx, session);
      return;
    }

    if (session.state === "awaiting_tag") {
      // A text message while picking a tag is treated as stray input.
      await replyText(ctx, s(ctx).awaitingTag);
      return;
    }

    // Idle: ignore stray messages (or gently nudge).
  });

  // Inline callback: tag selection and pagination.
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const session = getSession(chatId(ctx));

    if (session.state !== "awaiting_tag") {
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === CANCEL) {
      clearSession(chatId(ctx));
      await ctx.answerCallbackQuery();
      const strings = s(ctx);
      await ctx.reply(strings.cancelled, {
        reply_markup: replyKeyboard(mainReplyKeyboard(strings)),
      });
      return;
    }

    if (data.startsWith(PAGE_PREFIX)) {
      const page = Number.parseInt(data.slice(PAGE_PREFIX.length), 10) || 0;
      updateSession(chatId(ctx), { tagPage: page });
      await ctx.answerCallbackQuery();
      await refreshTagPicker(ctx, page);
      return;
    }

    if (data.startsWith(TAG_PREFIX)) {
      const tagId = Number.parseInt(data.slice(TAG_PREFIX.length), 10);
      await ctx.answerCallbackQuery();
      await finalizeSuggestion(ctx, session, tagId);
      return;
    }

    await ctx.answerCallbackQuery();
  });
}

async function handleContent(ctx: Context, session: ReturnType<typeof getSession>): Promise<void> {
  const strings = s(ctx);
  const media = extractMedia(ctx);
  const text = ctx.message?.text ?? ctx.message?.caption ?? null;

  const sizeError = validateMediaSize(ctx, media);
  if (sizeError) {
    await replyText(ctx, sizeError, replyKeyboard(cancelReplyKeyboard(strings)));
    return;
  }

  const hasText = !!text && text.trim().length > 0;
  const hasMedia = media.length > 0;

  if (!hasText && !hasMedia) {
    await replyText(ctx, strings.invalidContent, replyKeyboard(cancelReplyKeyboard(strings)));
    return;
  }

  if (text && text.length > MAX_TEXT_LENGTH) {
    await replyText(ctx, strings.textTooLong, replyKeyboard(cancelReplyKeyboard(strings)));
    return;
  }

  // Capture draft and move to tag selection.
  updateSession(chatId(ctx), {
    state: "awaiting_tag",
    text: text?.trim() || null,
    media,
    contentMessageId: ctx.message?.message_id ?? null,
    tagPage: 0,
  });

  await refreshTagPicker(ctx, 0);
}

async function refreshTagPicker(ctx: Context, page: number): Promise<void> {
  const strings = s(ctx);
  let tags: { id: number; name: string }[] = [];
  try {
    tags = (await botApi.getTags()).tags;
  } catch (err) {
    logger.error("bot: failed to load tags", { error: String(err) });
    await replyText(ctx, strings.error);
    return;
  }

  if (tags.length === 0) {
    await replyText(ctx, strings.error);
    return;
  }

  await ctx.reply(strings.awaitingTag, {
    reply_markup: { inline_keyboard: tagPickerKeyboard(tags, page, strings) },
  });
}

async function finalizeSuggestion(
  ctx: Context,
  session: ReturnType<typeof getSession>,
  tagId: number,
): Promise<void> {
  const strings = s(ctx);
  const chat = chatId(ctx);

  const idempotencyKey = `${chat}:${session.contentMessageId ?? Date.now()}`;

  // Ensure the user exists before submitting (covers users who skipped /start).
  await syncUserFromCtx(ctx);

  try {
    const result = await botApi.createSuggestion({
      telegramId: chat,
      tagId,
      type: session.media.length > 0
        ? (session.media[0].kind as "photo" | "video")
        : "text",
      text: session.text,
      idempotencyKey,
      telegramMessageId: session.contentMessageId ?? undefined,
      media: session.media.map((m) => ({
        kind: m.kind,
        fileId: m.fileId,
        fileUniqueId: m.fileUniqueId ?? undefined,
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
        sizeBytes: m.sizeBytes,
        mimeType: m.mimeType,
      })),
    });

    clearSession(chat);
    const message = result.alreadyExists
      ? strings.suggestionDuplicate(result.suggestion.id)
      : strings.suggestionSaved(result.suggestion.id);
    await replyText(ctx, message, replyKeyboard(mainReplyKeyboard(strings)));
  } catch (err) {
    if (err instanceof BotApiError) {
      clearSession(chat);
      await handleBotApiError(ctx, err);
      return;
    }
    logger.error("bot: unexpected error saving suggestion", { error: String(err) });
    await replyText(ctx, strings.error, replyKeyboard(mainReplyKeyboard(strings)));
  }
}

async function handleBotApiError(ctx: Context, err: BotApiError): Promise<void> {
  const strings = s(ctx);
  const keyboard = replyKeyboard(mainReplyKeyboard(strings));

  switch (err.code) {
    case "BOT_DISABLED":
      await replyText(ctx, strings.botDisabled, keyboard);
      break;
    case "USER_BANNED": {
      const details = err.details as { banEndsAt?: string | null } | undefined;
      await replyText(ctx, strings.banned("", details?.banEndsAt ?? null), keyboard);
      break;
    }
    case "RATE_LIMIT": {
      const details = err.details as { retryAfterSec?: number } | undefined;
      await replyText(ctx, strings.rateLimited(details?.retryAfterSec ?? 60), keyboard);
      break;
    }
    case "DUPLICATE":
      await replyText(ctx, strings.duplicateContent, keyboard);
      break;
    case "INVALID_TAG":
    case "EMPTY":
    default:
      await replyText(ctx, strings.error, keyboard);
      break;
  }
}

function chatId(ctx: Context): number {
  return ctx.chat!.id;
}

/** Upsert the Telegram user on the backend (ban status is checked at intake). */
async function syncUserFromCtx(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  try {
    await botApi.syncUser({
      telegramId: from.id,
      username: from.username ?? null,
      firstName: from.first_name,
      lastName: from.last_name ?? null,
      languageCode: from.language_code ?? null,
    });
  } catch (err) {
    logger.warn("bot: user sync failed", { error: String(err) });
  }
}
