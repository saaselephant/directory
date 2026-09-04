import { listPublishedSoftware } from "@/lib/repositories/software";

import { SoftwareCatalog } from "./software-catalog";

export const dynamic = "force-dynamic";

export default async function SoftwareIndexPage() {
  const result = await listPublishedSoftware();

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <p className="eyebrow">Catalog</p>
        <h1>Software directory</h1>
        <p className="lede">Clear, practical software recommendations for growing teams.</p>
      </header>
      <SoftwareCatalog result={result} />
    </main>
  );
}
