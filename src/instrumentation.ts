export async function register() {
  // The import must sit inside this check so the bundler drops it from the edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDatabase } = await import("./lib/bootstrap");
    try {
      await ensureDatabase();
    } catch (e) {
      console.error("[obsa] database bootstrap failed", e);
    }
  }
}
