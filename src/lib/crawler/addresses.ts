import net from "node:net";

/**
 * Which kind of network address an IP is, for the crawler's SSRF guard.
 *
 *  - "public":   an ordinary internet address. Always allowed.
 *  - "loopback": this machine (127.0.0.0/8, ::1). Allowed only with ALLOW_LOCAL_TARGETS=true,
 *                which exists for the local test site.
 *  - "private":  everything else that isn't the public internet: home/office networks, cloud
 *                metadata services (169.254.169.254), carrier NAT, multicast, reserved ranges.
 *                Never allowed, even with ALLOW_LOCAL_TARGETS, because no real audit needs them
 *                and they are what an attacker would aim a redirect at.
 */
export type AddressKind = "public" | "loopback" | "private";

const loopback = new net.BlockList();
loopback.addSubnet("127.0.0.0", 8, "ipv4");
loopback.addAddress("::1", "ipv6");

const blocked = new net.BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["169.254.0.0", 16], // link-local, including cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
] as const) blocked.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["::", 128], // unspecified
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (can wrap any IPv4 address)
  ["fc00::", 7], // unique local (private)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // old site-local
  ["ff00::", 8], // multicast
] as const) blocked.addSubnet(ip, bits, "ipv6");

/** The IPv4 address hidden inside an IPv4-mapped, IPv4-compatible or NAT64 IPv6 address, if any. */
function embeddedIpv4(ip: string): string | null {
  const v = ip.toLowerCase();
  const m = /^(?:::ffff:|::|64:ff9b::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(v);
  if (!m) return null;
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16);
  const lo = parseInt(m[3], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function addressKind(raw: string): AddressKind {
  const ip = raw.replace(/^\[|\]$/g, "").split("%")[0];
  const family = net.isIP(ip);
  if (family === 0) return "private"; // not an IP at all: refuse rather than guess
  if (family === 6) {
    const v4 = embeddedIpv4(ip);
    if (v4) return addressKind(v4);
  }
  const type = family === 4 ? "ipv4" : "ipv6";
  if (loopback.check(ip, type)) return "loopback";
  if (blocked.check(ip, type)) return "private";
  return "public";
}

/** Host names that always mean "this machine" or a private network, whatever DNS says. */
export function isLoopbackName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost");
}
export function isPrivateName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa") || !h.includes(".");
}
