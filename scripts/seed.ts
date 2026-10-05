/** Wipes the database and loads the OBSA demo data. Usage: npm run db:seed (or db:reset for a fresh file). */
import { seedDemo } from "../src/lib/demo-seed";

seedDemo().catch((e) => {
  console.error(e);
  process.exit(1);
});
