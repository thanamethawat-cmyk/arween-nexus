export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDb, publicDbError, withDbRetry } = await import("@/lib/db");
    try {
      await withDbRetry(() => ensureDb());
      console.log("ARWEEN schema ready. Demo business, cash, debt, and the INV-9001 anchor are seeded when the database is empty.");
    } catch (error) {
      console.error(`Database was not ready at startup. The next request will retry. ${publicDbError(error)}`);
    }
  }
}
