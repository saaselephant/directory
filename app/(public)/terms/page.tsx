import { publicMetadata } from "@/lib/config/site";
import { InformationPage } from "../information-page";
export const metadata = publicMetadata(
  "Terms",
  "Using the SaaSElephant software directory and vendor links.",
  "/terms",
);
export default function TermsPage() {
  return (
    <InformationPage
      title="Terms"
      introduction="Useful software information, with a clear distinction between discovery and purchase."
    >
      <section>
        <h2>About the directory</h2>
        <p>
          SaaSElephant helps you discover third-party software and review product essentials.
          Listings are informational and do not guarantee that a product will meet your
          requirements. Search is a catalog search, not personalized professional advice.
        </p>
      </section>
      <section>
        <h2>Check details with the vendor</h2>
        <p>
          Features, pricing, free plans and trials can change. Confirm current availability,
          eligibility and terms on the vendor’s official website before making a decision. A listing
          does not imply endorsement, certification or a commercial partnership.
        </p>
      </section>
      <section>
        <h2>Purchases and support</h2>
        <p>
          Software purchases, subscriptions, billing, cancellations, refunds and product support are
          handled by the relevant vendor under its terms. SaaSElephant does not sell the listed
          third-party software through this directory.
        </p>
      </section>
      <section>
        <h2>Affiliate relationships</h2>
        <p>
          Some outbound links are affiliate links. We may receive a commission from qualifying
          purchases at no additional cost to you. Placement in the directory does not by itself
          indicate a paid promotion.
        </p>
      </section>
      <section>
        <h2>Responsible use and identities</h2>
        <p>
          Do not misuse the service, attempt unauthorized access or disrupt availability.
          SaaSElephant, TUSKEY AI™ and Pralka Tech™ identify their respective product and ecosystem
          roles. Third-party names and logos belong to their respective owners.
        </p>
      </section>
    </InformationPage>
  );
}
