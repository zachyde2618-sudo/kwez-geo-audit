import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Kwez GEO Audit" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="25 November 2026">
      <p>
        This policy explains what personal information the Kwez GEO Audit (&ldquo;the app&rdquo;) handles, why, who it is shared with and
        what your rights are under UK data protection law (the UK GDPR and the Data Protection Act 2018).
      </p>

      <H2>Who we are</H2>
      <p>
        The app is run by [Kwez legal name, for example Kwez Ltd or your own name trading as Kwez], [registered or business address]
        (&ldquo;Kwez&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the controller of the personal information described here. Contact us
        about privacy at [privacy email address]. [ICO registration number, once the data protection fee is paid.]
      </p>

      <H2>What the app does</H2>
      <p>
        The app checks how visible a business is to AI assistants. It reads the business&rsquo;s public website, runs web searches about
        the business, and asks an AI assistant questions a customer might ask, then produces a scored report.
      </p>

      <H2>The information we handle</H2>
      <List>
        <li>
          <strong>Details you give us about a business:</strong> its website address, name, industry, town, services, competitors, Companies
          House number and links to its review, social and press pages.
        </li>
        <li>
          <strong>Details about people at the business</strong>, if you add them: full name, job title and links to public profiles such as
          LinkedIn. We use these only to check the website describes them consistently. We do not scrape LinkedIn or Google Business
          Profiles.
        </li>
        <li>
          <strong>Public web content:</strong> text from the business&rsquo;s own website and from a small number of public third-party pages
          found by web search (for example review or directory listings). These can mention people, such as reviewers or staff.
        </li>
        <li>
          <strong>The audit report</strong> built from the above, with quotes from those pages as evidence.
        </li>
        <li>
          <strong>Technical information:</strong> our hosting provider keeps standard server logs (such as IP address, browser and the pages
          requested) for security. [Confirm what your host logs and for how long.]
        </li>
      </List>

      <H2>Why we use it, and our lawful basis</H2>
      <List>
        <li>
          To carry out an audit you asked for, and to deliver our services to you: <em>performance of a contract</em>, or steps you asked for
          before entering one.
        </li>
        <li>
          To process names and public information about people connected to an audited business, and public reviews: our{" "}
          <em>legitimate interests</em> in producing an accurate audit. We use only information that is already public or that the business
          gave us, and only what the audit needs.
        </li>
        <li>
          To keep the app secure and prevent misuse: our <em>legitimate interests</em>.
        </li>
      </List>

      <H2>Who we share it with</H2>
      <p>We use these service providers (processors), who handle information only on our instructions:</p>
      <List>
        <li>
          <strong>Anthropic</strong> (Claude AI): page text, search results and audit questions are sent to Anthropic&rsquo;s API to produce
          the AI parts of the audit. Anthropic is based in the USA. [Check and record Anthropic&rsquo;s current commercial terms and data
          retention.]
        </li>
        <li>
          <strong>[Serper or Brave Search]</strong>: search queries about the business (its name, website and town) are sent to run web searches.
        </li>
        <li>
          <strong>[Hosting provider, for example GitHub Codespaces today]</strong>: stores the app and saved audits.
        </li>
      </List>
      <p>
        Some of these providers are outside the UK. Where they are, we rely on UK adequacy regulations or the UK International Data Transfer
        Agreement or Addendum, as offered in each provider&rsquo;s terms. [Solicitor to confirm the transfer mechanism for each provider.] We
        never sell personal information.
      </p>

      <H2>How long we keep it</H2>
      <p>
        Audits are kept so we can compare a business&rsquo;s progress over time. We delete an audit when it is no longer needed and in any case
        after [24 months], or sooner if you ask. Search results are cached for 24 hours.
      </p>

      <H2>Cookies</H2>
      <p>
        The app does not use cookies, analytics or advertising trackers, so there is no cookie banner. If a password is turned on, your
        browser remembers the sign-in for the session; that is not a cookie and is not used to track you. If we ever add analytics or other
        non-essential cookies, we will ask for your consent first and update this page.
      </p>

      <H2>Your rights</H2>
      <p>
        You can ask us for a copy of your information, to correct it, to delete it, to restrict or object to how we use it, and to move it to
        another provider. Email [privacy email address]. We will reply within one month. You can also complain to the Information
        Commissioner&rsquo;s Office (ICO) at ico.org.uk or on 0303 123 1113, but please contact us first so we can try to help.
      </p>

      <H2>Security</H2>
      <p>
        We protect the app with access controls, encrypted connections, limits on use and regular updates. API keys are kept on the server
        and never sent to your browser. No system is perfectly secure; if a breach puts your information at risk we will tell you and the ICO
        where the law requires.
      </p>

      <H2>Changes</H2>
      <p>
        We will update this page if anything changes, with the new date at the top. See also our <Link href="/terms" className="text-accent underline">terms of use</Link>{" "}
        and <Link href="/disclaimer" className="text-accent underline">audit disclaimer</Link>.
      </p>
    </LegalPage>
  );
}
