import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use · Kwez GEO Audit" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="25 November 2026">
      <p>
        These terms apply when you use the Kwez GEO Audit (&ldquo;the app&rdquo;) or receive an audit report from it. The app is provided by
        [Kwez legal name], [address] (&ldquo;Kwez&rdquo;, &ldquo;we&rdquo;). By using the app or a report you agree to these terms. If you buy a
        paid service from us, the contract or proposal for that service also applies, and it wins where the two differ.
      </p>

      <H2>What the app and reports are</H2>
      <p>
        An audit is an automated review of a website&rsquo;s visibility to AI assistants at one point in time. It combines automatic checks,
        judgements made by an AI model, web search results and answers from AI assistants. Please read the{" "}
        <Link href="/disclaimer" className="text-accent underline">audit disclaimer</Link>: scores are estimates, not guarantees.
      </p>

      <H2>Using the app properly</H2>
      <p>You agree not to:</p>
      <List>
        <li>try to get into parts of the app, data or systems you are not allowed to use, or get round its password or limits;</li>
        <li>use the app to attack, overload or scan websites or networks, or to fetch anything other than public web pages;</li>
        <li>enter information you have no right to share, including other people&rsquo;s personal information beyond what an audit needs;</li>
        <li>copy, resell or rebrand the app or its reports as your own without our written agreement.</li>
      </List>
      <p>We may suspend access if we reasonably believe these terms are being broken.</p>

      <H2>The websites being audited</H2>
      <p>
        The app reads only public pages, follows the website&rsquo;s robots.txt rules, identifies itself as KwezGEOAudit and makes at most one
        request per second. If you ask for an audit of a website, you confirm you own it, work for its owner, or are otherwise entitled to ask
        for a review of its public pages.
      </p>

      <H2>Ownership</H2>
      <p>
        We own the app, its checks, scoring method and report design. Once you have paid for a report (or if we give it to you free), you may
        use it within your business and share it with people helping you act on it. Quoted website text and third-party names, trade marks
        and content remain the property of their owners.
      </p>

      <H2>Our responsibility to you</H2>
      <List>
        <li>We will provide the app and reports with reasonable care and skill.</li>
        <li>
          We do not promise any particular score, ranking, number of mentions by AI assistants, traffic, leads or sales. AI assistants and
          search engines are run by other companies and change without notice.
        </li>
        <li>
          If you use the app for business purposes, we are not liable for loss of profit, revenue, business, goodwill or data, or for indirect
          losses, and our total liability in connection with an audit is limited to [the fees you paid for that audit, or £100 if it was free].
        </li>
        <li>
          Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law
          does not allow us to limit. If you are a consumer, your statutory rights are not affected.
        </li>
      </List>

      <H2>Availability and changes</H2>
      <p>
        The app may be unavailable at times for maintenance or reasons outside our control. We may change the app, its checks and these terms;
        the date at the top shows the latest version.
      </p>

      <H2>Privacy</H2>
      <p>
        How we handle personal information is explained in our <Link href="/privacy" className="text-accent underline">privacy policy</Link>.
      </p>

      <H2>Law and disputes</H2>
      <p>
        These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. [Solicitor to confirm,
        especially for clients in Scotland or Northern Ireland.] Questions or complaints: [contact email address].
      </p>
    </LegalPage>
  );
}
