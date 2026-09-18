import Image from "next/image";

export function TuskeySignature({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`tuskey-signature${compact ? " tuskey-signature-compact" : ""}`}>
      <span
        className="tuskey-coin"
        role={compact ? "img" : undefined}
        aria-label={compact ? "TUSKEY AI™ — AI by Pralka Tech™" : undefined}
      >
        <Image src="/tuskey-mark.png" alt="" width={64} height={64} unoptimized />
      </span>
      {!compact && (
        <span className="tuskey-identity">
          <strong>TUSKEY AI™</strong>
          <span>AI by Pralka Tech™</span>
        </span>
      )}
    </div>
  );
}
