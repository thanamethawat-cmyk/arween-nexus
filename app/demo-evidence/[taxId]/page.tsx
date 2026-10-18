import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DemoEvidencePage({ params }: { params: Promise<{ taxId: string }> }) {
  const { taxId } = await params;
  if (!/^[0-9A-Za-z-]{5,32}$/.test(taxId)) notFound();
  return (
    <main className="shell">
      <p className="banner">
        not verified. Tavily was not called for this tax ID. This page is not a registry record and it does not confirm or deny the ID.
      </p>
      <article className="panel">
        <p className="kicker">Counterparty check</p>
        <h1>not verified</h1>
        <p>No public search result is stored for tax ID {taxId}. Set TAVILY_API_KEY to query Tavily with the legal name and this tax ID only.</p>
        <Link href="/">Back to ARWEEN-Nexus</Link>
      </article>
    </main>
  );
}
