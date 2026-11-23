import { describe, expect, it } from "vitest";
import { normaliseWebsiteUrl, parseAuditInput } from "@/lib/schemas/input";
import { ZodError } from "zod";

describe("normaliseWebsiteUrl", () => {
  it.each([
    ["example.co.uk", "https://example.co.uk/"],
    ["  http://Example.CO.UK/about#team ", "https://example.co.uk/about"],
    ["https://www.example.com/path?q=1", "https://www.example.com/path?q=1"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseWebsiteUrl(raw)).toBe(expected);
  });

  it.each(["", "not a url", "ftp://example.com", "localhost", "http://127.0.0.1", "https://192.168.1.5", "https://user:pw@example.com", "https://intranet"])(
    "rejects %s",
    (raw) => {
      expect(normaliseWebsiteUrl(raw)).toBeNull();
    },
  );

  it("keeps http for local hosts only when allowed", () => {
    expect(normaliseWebsiteUrl("http://localhost:4010", true)).toBe("http://localhost:4010/");
  });
});

describe("parseAuditInput", () => {
  it("applies defaults", () => {
    const i = parseAuditInput({ url: "example.co.uk" });
    expect(i.url).toBe("https://example.co.uk/");
    expect(i.country).toBe("United Kingdom");
    expect(i.options).toEqual({ maxPages: 25, runVisibility: true, promptCount: 10 });
    expect(i.people).toEqual([]);
  });

  it("rejects more than 5 competitors and non-LinkedIn profile URLs", () => {
    expect(() => parseAuditInput({ url: "example.co.uk", competitors: Array(6).fill({ name: "A" }) })).toThrow(ZodError);
    expect(() =>
      parseAuditInput({ url: "example.co.uk", people: [{ fullName: "Jo Bloggs", linkedinUrl: "https://example.com/jo" }] }),
    ).toThrow(ZodError);
  });

  it("normalises a Companies House number and blank optional URLs", () => {
    const i = parseAuditInput({
      url: "example.co.uk",
      identity: { companiesHouseNumber: "1234567", googleBusinessProfileUrl: "", reviewUrls: ["", "uk.trustpilot.com/review/example.co.uk"] },
      people: [{ fullName: "Jo Bloggs", linkedinUrl: "linkedin.com/in/jobloggs" }],
    });
    expect(i.identity.companiesHouseNumber).toBe("01234567");
    expect(i.identity.googleBusinessProfileUrl).toBeUndefined();
    expect(i.identity.reviewUrls).toEqual(["https://uk.trustpilot.com/review/example.co.uk"]);
    expect(i.people[0].linkedinUrl).toBe("https://linkedin.com/in/jobloggs");
  });

  it("caps max pages and prompt count at 100", () => {
    expect(() => parseAuditInput({ url: "example.co.uk", options: { maxPages: 500 } })).toThrow(ZodError);
    expect(() => parseAuditInput({ url: "example.co.uk", options: { promptCount: 101 } })).toThrow(ZodError);
  });
});
