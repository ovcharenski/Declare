import type { InlineKeyboardButton, KeyboardButton, ReplyKeyboardMarkup } from "grammy/types";

/**
 * Bot keyboards (plan §10). Reply keyboard for the main menu; inline keyboard
 * for the tag picker with pagination (2 per row) and Back/Cancel controls.
 */

export const SEND_SUGGESTION = "send_suggestion";
export const ABOUT = "about";
export const CANCEL = "cancel";
export const BACK = "back";
export const TAG_PREFIX = "tag:";
export const PAGE_PREFIX = "page:";

interface KeyboardStrings {
  sendSuggestion: string;
  about: string;
  cancel: string;
  back: string;
}

/** Build a full ReplyKeyboardMarkup from button rows. */
export function replyKeyboard(rows: KeyboardButton[][]): ReplyKeyboardMarkup {
  return { keyboard: rows, resize_keyboard: true };
}

export function mainReplyKeyboard(s: KeyboardStrings): KeyboardButton[][] {
  return [
    [{ text: s.sendSuggestion }],
    [{ text: s.about }],
  ];
}

export function cancelReplyKeyboard(s: KeyboardStrings): KeyboardButton[][] {
  return [[{ text: s.cancel }]];
}

/**
 * Inline keyboard for tag selection. `page` is 0-based; 2 tags per row.
 * Callback data is `tag:<id>` for a selection and `page:<n>` to navigate.
 */
export function tagPickerKeyboard(
  tags: { id: number; name: string }[],
  page: number,
  s: KeyboardStrings,
): InlineKeyboardButton[][] {
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(tags.length / pageSize));
  const clamped = Math.min(Math.max(0, page), totalPages - 1);

  const slice = tags.slice(clamped * pageSize, (clamped + 1) * pageSize);
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < slice.length; i += 2) {
    const row: InlineKeyboardButton[] = slice.slice(i, i + 2).map((tag) => ({
      text: tag.name,
      callback_data: `${TAG_PREFIX}${tag.id}`,
    }));
    rows.push(row);
  }

  const nav: InlineKeyboardButton[] = [];
  if (clamped > 0) {
    nav.push({ text: s.back, callback_data: `${PAGE_PREFIX}${clamped - 1}` });
  } else {
    nav.push({ text: s.cancel, callback_data: CANCEL });
  }
  if (clamped < totalPages - 1) {
    nav.push({
      text: `${clamped + 2}/${totalPages} ›`,
      callback_data: `${PAGE_PREFIX}${clamped + 1}`,
    });
  }
  rows.push(nav);

  return rows;
}
