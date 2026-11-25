import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Audit disclaimer · Kwez GEO Audit" };

export default function DisclaimerPage() {
  return (
    <LegalPage title="Audit disclaimer" updated="25 November 2026">
      <p>
        Every Kwez GEO Audit report is an <strong>estimate, not a guarantee</strong>. Please read this before relying on a score or acting on a
        recommendation.
      </p>

      <H2>What a score means</H2>
      <List>
        <li>
          The score out of 100 is Kwez&rsquo;s own measure. It is not issued or endorsed by OpenAI, Anthropic, Google, Microsoft, Perplexity or
          any other AI or search company, and those companies do not publish how their assistants choose what to say.
        </li>
        <li>It reflects the website and the web on the day of the audit. Websites, search results and AI assistants change constantly.</li>
        <li>
          Some checks are judged by an AI model and some depend on third-party search and AI services. AI can make mistakes, and the same
          question asked twice can get different answers. Every finding comes with its evidence so you can check it yourself; where we
          couldn&rsquo;t find evidence the check says &ldquo;Unable to verify&rdquo;.
        </li>
        <li>A higher score should make a business easier for AI assistants to find and describe, but it does not guarantee mentions, rankings, traffic or sales.</li>
      </List>

      <H2>Recommendations</H2>
      <p>
        The to-do list is general guidance on website content and structure. It is not legal, financial, accessibility-compliance or
        security advice. Check any change that affects your legal pages, regulated claims or data handling with a suitable professional.
      </p>

      <H2>Third-party content</H2>
      <p>
        Reports quote public web pages, reviews and AI answers as evidence. We don&rsquo;t control that content and don&rsquo;t endorse it. Names
        and trade marks belong to their owners and are used only to describe what we found.
      </p>

      <p>
        See also the <Link href="/terms" className="text-accent underline">terms of use</Link> and{" "}
        <Link href="/privacy" className="text-accent underline">privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
