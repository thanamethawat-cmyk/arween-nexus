import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_TAX_HITS } from "@/lib/tavily/fixtures";

export default async function DemoEvidencePage({ params }: { params: Promise<{ taxId: string }> }) {
  const { taxId } = await params;
  const hits = DEMO_TAX_HITS[taxId];
  if (!hits) notFound();
  const hit = hits[0];
  return (
    <main className="shell">
      <p className="banner">This is a fictional demo registry card. It is not a live Tavily result and it is not a government record.</p>
      <article className="panel">
        <p className="kicker">Demo evidence</p>
        <h1>{hit?.title}</h1>
        <p>{hit?.snippet}</p>
        <p className="meta">Tax ID {taxId}</p>
        <Link href="/">Back to ARWEEN-Nexus</Link>
      </article>
    </main>
  );
}
