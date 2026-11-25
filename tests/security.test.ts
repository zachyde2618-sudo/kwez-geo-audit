import { afterEach, describe, expect, it } from "vitest";
import { redactSecrets } from "@/config";
import { addressKind } from "@/lib/crawler/addresses";
import { assertPublicTarget } from "@/lib/crawler/fetcher";
import { BodyError, readJsonBody, resetLimitsForTests, takeToken } from "@/lib/limits";
import { isValidAuditId, loadAudit } from "@/lib/storage";

afterEach(() => {
  delete process.env.ALLOW_LOCAL_TARGETS;
  delete process.env.ANTHROPIC_API_KEY;
  resetLimitsForTests();
});

describe("address guard (SSRF)", () => {
  it.each([
    ["8.8.8.8", "public"],
    ["2a00:1450:4009:81f::200e", "public"],
    ["127.0.0.1", "loopback"],
    ["::1", "loopback"],
    ["::ffff:7f00:1", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "private"],
    ["::ffff:a9fe:a9fe", "private"], // metadata address hidden in IPv6
    ["::ffff:169.254.169.254", "private"],
    ["64:ff9b::a9fe:a9fe", "private"],
    ["100.64.0.1", "private"],
    ["0.0.0.0", "private"],
    ["224.0.0.1", "private"],
    ["fd00::1", "private"],
    ["fe80::1", "private"],
    ["not-an-ip", "private"],
  ])("%s is %s", (ip, kind) => {
    expect(addressKind(ip)).toBe(kind);
  });

  it("never allows private networks or cloud metadata, even with ALLOW_LOCAL_TARGETS", async () => {
    process.env.ALLOW_LOCAL_TARGETS = "true";
    await expect(assertPublicTarget(new URL("http://169.254.169.254/latest/meta-data/"))).rejects.toThrow(/private/);
    await expect(assertPublicTarget(new URL("http://[::ffff:a9fe:a9fe]/"))).rejects.toThrow(/private/);
    await expect(assertPublicTarget(new URL("http://192.168.0.1/"))).rejects.toThrow(/private/);
    await expect(assertPublicTarget(new URL("http://printer.local/"))).rejects.toThrow(/private/);
    await expect(assertPublicTarget(new URL("http://localhost:4010/"))).resolves.toBeUndefined();
    await expect(assertPublicTarget(new URL("http://127.0.0.1:4010/"))).resolves.toBeUndefined();
  });

  it("refuses loopback without ALLOW_LOCAL_TARGETS, other protocols, and passwords in addresses", async () => {
    await expect(assertPublicTarget(new URL("http://localhost/"))).rejects.toThrow(/private/);
    await expect(assertPublicTarget(new URL("http://[::ffff:7f00:1]/"))).rejects.toThrow(/private/);
    await expect(assertPublicTarget(new URL("file:///etc/passwd"))).rejects.toThrow(/protocol/);
    await expect(assertPublicTarget(new URL("https://user:pw@8.8.8.8/"))).rejects.toThrow(/password/);
  });
});

describe("audit storage paths", () => {
  it("rejects ids that could escape the audits folder", async () => {
    for (const id of ["../etc/passwd", "..", "a/b", "2026-11-25-abc..", "%2e%2e", "_favourites", "A".repeat(10)]) {
      expect(isValidAuditId(id)).toBe(false);
      expect(await loadAudit(id)).toBeNull();
    }
  });
});

describe("limits", () => {
  it("allows up to the limit, then says how long to wait", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(takeToken("t", 3, 60_000, now)).toBe(0);
    expect(takeToken("t", 3, 60_000, now)).toBe(60);
    expect(takeToken("t", 3, 60_000, now + 60_001)).toBe(0);
  });

  it("only accepts small JSON bodies", async () => {
    const post = (body: string, type = "application/json") => new Request("http://x/api", { method: "POST", body, headers: { "content-type": type } });
    await expect(readJsonBody(post('{"a":1}'))).resolves.toEqual({ a: 1 });
    await expect(readJsonBody(post('{"a":1}', "text/plain"))).rejects.toMatchObject({ status: 415 });
    await expect(readJsonBody(post("x".repeat(2000), "application/json"), 1000)).rejects.toBeInstanceOf(BodyError);
    await expect(readJsonBody(post("{oops"))).rejects.toMatchObject({ status: 400 });
  });
});

describe("secrets", () => {
  it("hides configured keys and anything shaped like an Anthropic key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-SECRETSECRETSECRET";
    expect(redactSecrets("401: key sk-ant-api03-SECRETSECRETSECRET rejected")).toBe("401: key [hidden] rejected");
    expect(redactSecrets("other sk-ant-admin01-abcdefghijkl")).toBe("other [hidden]");
  });
});

describe("audit form addresses", async () => {
  const { normaliseWebsiteUrl } = await import("@/lib/schemas/input");
  it("with local targets on, accepts only this machine", () => {
    expect(normaliseWebsiteUrl("http://localhost:4010", true)).toBe("http://localhost:4010/");
    expect(normaliseWebsiteUrl("http://127.0.0.1:4010", true)).toBe("http://127.0.0.1:4010/");
    expect(normaliseWebsiteUrl("http://169.254.169.254", true)).toBeNull();
    expect(normaliseWebsiteUrl("http://192.168.1.1", true)).toBeNull();
    expect(normaliseWebsiteUrl("http://10.0.0.1", false)).toBeNull();
  });
});
