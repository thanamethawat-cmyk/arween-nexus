export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDb } = await import("@/lib/db");
    await ensureDb();
    console.log("ARWEEN schema ready. Demo business, cash, debt, and the INV-9001 anchor are seeded when the database is empty.");
  }
}
