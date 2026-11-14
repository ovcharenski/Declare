import { getDb } from "./connection";
import { tagsRepo } from "../repositories/tags";
import { logger } from "../logger";

/**
 * Development seed: default tags and a couple of test users. Runs only under
 * NODE_ENV=development (enforced by the caller / npm script). Idempotent.
 */

const DEV_TAGS = [
  { name: "Идея", description: "Предложения новых функций и улучшений" },
  { name: "Баг", description: "Сообщения об ошибках и проблемах" },
  { name: "Дизайн", description: "Замечания по интерфейсу и внешнему виду" },
  { name: "Контент", description: "Пожелания по материалам и наполнению" },
  { name: "Другое", description: "Всё остальное" },
];

export function seedDev(): void {
  if (process.env.NODE_ENV !== "development") {
    logger.warn("seed skipped: NODE_ENV is not development");
    return;
  }

  const db = getDb();
  const tags = tagsRepo(db);

  const existing = new Set(tags.list(true).map((t) => t.name.toLowerCase()));
  let created = 0;

  for (const tag of DEV_TAGS) {
    if (existing.has(tag.name.toLowerCase())) continue;
    tags.create(tag);
    created++;
  }

  logger.info("dev seed complete", { tagsCreated: created });
}
