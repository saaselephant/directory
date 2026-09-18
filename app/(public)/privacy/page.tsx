import { publicMetadata } from "@/lib/config/site";
import { InformationPage } from "../information-page";
export const metadata = publicMetadata(
  "Privacy",
  "How SaaSElephant handles browsing, analytics and affiliate links.",
  "/privacy",
);
export default function PrivacyPage() {
  return (
    <InformationPage
      title="Privacy"
      introduction="A clear view of how information is used when you browse SaaSElephant."
    >
      <section>
        <h2>Browsing the directory</h2>
        <p>
          You can search and browse without a customer account. Search terms and category selections
          are included in the page address so that results can be shared. Avoid entering personal or
          sensitive information into search.
        </p>
        <p>
          Our hosting and database providers process technical request information needed to deliver
          pages, such as network addresses and browser information. Authorized editorial accounts
          use authentication cookies; public browsing does not require signing in.
        </p>
      </section>
      <section>
        <h2>Website analytics</h2>
        <p>
          We use Google Analytics to understand use of the public site. Google Analytics can use
          cookies and process browser, device and network information. Our application’s explicit
          page-view events use page paths without search terms, URL query strings or fragments. The
          application does not load analytics on admin pages. Additional automatic measurement
          depends on the Google Analytics property settings.
        </p>
        <p>
          You can manage cookies in your browser and use browser privacy controls. Blocking
          analytics does not prevent you from browsing the directory.
        </p>
      </section>
      <section>
        <h2>Vendor and affiliate links</h2>
        <p>
          Product links may pass through our redirect service and an affiliate network before
          reaching a vendor. An eligible purchase may earn us a commission at no additional cost to
          you. Vendors and networks handle information under their own privacy policies, which may
          include referral identifiers, cookies and purchase attribution.
        </p>
      </section>
      <section>
        <h2>Third-party services</h2>
        <p>
          Visiting a vendor takes you outside SaaSElephant. Review the vendor’s privacy policy
          before providing personal information or creating an account. This page describes
          SaaSElephant’s browsing experience, not the practices of each listed product.
        </p>
      </section>
    </InformationPage>
  );
}
