import type { MetadataRoute } from "next";

/** The audit app is a private tool holding client details: ask every crawler to stay out. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
