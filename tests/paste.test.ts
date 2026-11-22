import { describe, expect, it } from "vitest";
import { makeAuditInputSchema, splitList } from "@/lib/schemas/input";
import { PASTE_TEMPLATE, parsePastedDetails } from "@/lib/paste";

const FULL = `Website: brightspark-leeds.co.uk
Company name: Bright Spark Electrical
Industry: Domestic electricians
Town: Leeds
Services: rewiring, EV charger installation, EICR certificates
Questions:
- How much does a house rewire cost in Leeds?
- Who can install an EV charger this week?
Competitors:
- Volt Leeds Ltd, voltleeds.co.uk
- https://www.sparkyco.co.uk
People:
- Jo Bloggs, Managing Director, https://www.linkedin.com/in/jo-bloggs-electrician
- Sam Patel - Lead EV Installer
Companies House number: 1234567
Google Business Profile: https://maps.app.goo.gl/abc123
Review profiles: https://www.trustpilot.com/review/brightspark.co.uk, https://www.checkatrade.com/trades/brightspark
Social profiles:
https://www.facebook.com/brightsparkleeds
https://www.instagram.com/brightsparkleeds
Press coverage or awards: https://www.yorkshireeveningpost.co.uk/business/award
`;

describe("parsePastedDetails", () => {
  it("fills every field from headed text", () => {
    const { details: d, unrecognised } = parsePastedDetails(FULL);
    expect(unrecognised).toEqual([]);
    expect(d.url).toBe("brightspark-leeds.co.uk");
    expect(d.companyName).toBe("Bright Spark Electrical");
    expect(d.industry).toBe("Domestic electricians");
    expect(d.town).toBe("Leeds");
    expect(d.services).toBe("rewiring, EV charger installation, EICR certificates");
    expect(d.questions).toBe("How much does a house rewire cost in Leeds?\nWho can install an EV charger this week?");
    expect(d.competitors).toEqual([
      { name: "Volt Leeds Ltd", url: "voltleeds.co.uk" },
      { name: "sparkyco.co.uk", url: "https://www.sparkyco.co.uk" },
    ]);
    expect(d.people).toEqual([
      { fullName: "Jo Bloggs", jobTitle: "Managing Director", linkedinUrl: "https://www.linkedin.com/in/jo-bloggs-electrician", otherUrls: "" },
      { fullName: "Sam Patel", jobTitle: "Lead EV Installer", linkedinUrl: "", otherUrls: "" },
    ]);
    expect(d.chNumber).toBe("1234567");
    expect(d.gbpUrl).toBe("https://maps.app.goo.gl/abc123");
    expect(splitList(d.reviewUrls!)).toHaveLength(2);
    expect(d.socialUrls).toBe("https://www.facebook.com/brightsparkleeds, https://www.instagram.com/brightsparkleeds");
    expect(d.pressUrls).toBe("https://www.yorkshireeveningpost.co.uk/business/award");
  });

  it("produces input the audit schema accepts", () => {
    const { details: d } = parsePastedDetails(FULL);
    const payload = {
      url: d.url,
      companyName: d.companyName,
      industry: d.industry,
      town: d.town,
      services: splitList(d.services!),
      exampleQuestions: d.questions!.split("\n"),
      competitors: d.competitors,
      people: d.people!.map((p) => ({ ...p, otherUrls: splitList(p.otherUrls) })),
      identity: { companiesHouseNumber: d.chNumber, googleBusinessProfileUrl: d.gbpUrl, reviewUrls: splitList(d.reviewUrls!), socialUrls: splitList(d.socialUrls!), pressUrls: splitList(d.pressUrls!) },
    };
    expect(makeAuditInputSchema(false).safeParse(payload).success).toBe(true);
  });

  it("handles Google Docs / markdown style headings, other label wording and bullets", () => {
    const { details: d } = parsePastedDetails(
      "## **Business name**\r\nBright Spark\r\n\r\nSector: Electricians\r\nLocation\r\nLeeds\r\nProducts and services\r\n• Rewiring\r\n• EV chargers\r\nTeam\r\n1. Jo Bloggs | Director\r\nWebsite: http://localhost:4010",
    );
    expect(d.companyName).toBe("Bright Spark");
    expect(d.industry).toBe("Electricians");
    expect(d.town).toBe("Leeds");
    expect(d.services).toBe("Rewiring, EV chargers");
    expect(d.people).toEqual([{ fullName: "Jo Bloggs", jobTitle: "Director", linkedinUrl: "", otherUrls: "" }]);
    expect(d.url).toBe("http://localhost:4010");
  });

  it("ignores the blank template (hints and empty bullets are not values)", () => {
    const r = parsePastedDetails(PASTE_TEMPLATE);
    expect(r.filled).toEqual(["country"]);
    expect(r.unrecognised).toEqual([]);
  });

  it("reports text outside any heading instead of guessing", () => {
    const r = parsePastedDetails("Hi, here are the details\nWebsite: example.co.uk\nFavourite colour: blue");
    expect(r.details.url).toBe("example.co.uk");
    expect(r.unrecognised).toEqual(["Hi, here are the details", "Favourite colour: blue"]);
  });

  it("reads options", () => {
    const { details: d } = parsePastedDetails("Max pages: 40\nRun AI visibility tests: yes\nNumber of test prompts: 30");
    expect(d).toMatchObject({ maxPages: "40", runVisibility: true, promptCount: "30" });
  });

  it("reports lines without a link under a links-only heading", () => {
    const r = parsePastedDetails("Social profiles:\nhttps://www.facebook.com/x\nask Jo for the Instagram");
    expect(r.details.socialUrls).toBe("https://www.facebook.com/x");
    expect(r.unrecognised).toEqual(["ask Jo for the Instagram"]);
  });
});
