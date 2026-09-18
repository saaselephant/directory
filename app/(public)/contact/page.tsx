import Link from "next/link";
import { publicMetadata } from "@/lib/config/site";
import { InformationPage } from "../information-page";
export const metadata = publicMetadata(
  "Contact",
  "Find the right route for software and directory enquiries.",
  "/contact",
);
export default function ContactPage() {
  return (
    <InformationPage title="Contact" introduction="Find the right place for your question.">
      <section>
        <h2>Help with a software product</h2>
        <p>
          For subscriptions, billing, refunds or technical support, contact the software vendor
          through its official website. Each product profile links to the vendor.
        </p>
        <Link className="text-link" href="/software">
          Find your software →
        </Link>
      </section>
      <section>
        <h2>Directory enquiries</h2>
        <p>
          A public contact channel for SaaSElephant is not currently listed. This page does not
          collect or submit messages.
        </p>
        <p>
          For details about browsing and affiliate links, read our{" "}
          <Link href="/privacy">Privacy</Link> and <Link href="/terms">Terms</Link> pages.
        </p>
      </section>
    </InformationPage>
  );
}
