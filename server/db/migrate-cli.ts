import "dotenv/config";
import { migrateAndExit } from "./migrate";

// Standalone entry for `npm run migrate`.
migrateAndExit();
