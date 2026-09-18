import { Breadcrumbs } from "./discovery";

export function InformationPage({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: React.ReactNode;
}) {
  return (
    <main className="information-page">
      <Breadcrumbs items={[{ label: title }]} />
      <header>
        <p className="eyebrow">SaaSElephant™</p>
        <h1>{title}</h1>
        <p className="lede">{introduction}</p>
      </header>
      <div className="information-content">{children}</div>
    </main>
  );
}
