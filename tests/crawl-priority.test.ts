import { describe, expect, it } from "vitest";
import { planNext } from "@/lib/crawler/crawl";
import { classifyRole } from "@/lib/crawler/extract";
import type { PageRole } from "@/lib/crawler/types";

/** Which pages get crawled first when a site has more pages than the budget. */

describe("page types", () => {
  const role = (path: string) => classifyRole(`https://shop.example${path}`);
  it("tells products, collections, services, policies and Shopify blogs apart", () => {
    expect(role("/products/vitamin-c-serum")).toBe("product");
    expect(role("/collections/face/products/vitamin-c-serum")).toBe("product");
    expect(role("/shop/oak-table")).toBe("product");
    expect(role("/collections/face")).toBe("collection");
    expect(role("/products")).toBe("collection");
    expect(role("/shop")).toBe("collection");
    expect(role("/services/ev-chargers")).toBe("services");
    expect(role("/treatments/hydrafacial")).toBe("services");
    expect(role("/pages/privacy-policy")).toBe("policy");
    expect(role("/policies/refund-policy")).toBe("policy");
    expect(role("/pages/shipping")).toBe("policy");
    expect(role("/blogs/own-it")).toBe("blog");
    expect(role("/blogs/own-it/organic-ingredients")).toBe("post");
    expect(role("/blog/how-much-does-a-rewire-cost")).toBe("post");
    expect(role("/pages/our-values")).toBe("about");
    expect(role("/pages/faq")).toBe("faq");
  });
});

describe("planNext", () => {
  /** Simulate a crawl over a fixed set of discovered pages. */
  function simulate(counts: Partial<Record<PageRole, number>>, budget: number) {
    const queue = new Map<string, { depth: number; role: PageRole }>();
    for (const [r, n] of Object.entries(counts) as [PageRole, number][]) for (let i = 0; i < n; i++) queue.set(`https://x/${r}/${String(i).padStart(3, "0")}`, { depth: 1, role: r });
    const picked: Partial<Record<PageRole, number>> = {};
    const order: PageRole[] = [];
    for (let i = 0; i < budget && queue.size; i++) {
      const url = planNext(queue, picked, budget + 1)!;
      const { role } = queue.get(url)!;
      queue.delete(url);
      picked[role] = (picked[role] ?? 0) + 1;
      order.push(role);
    }
    return { picked, order };
  }

  it("takes one of each key kind of page before anything else", () => {
    const { order } = simulate({ product: 200, faq: 3, about: 2, contact: 1, team: 1, post: 40, policy: 5 }, 9);
    expect(order.slice(0, 5).sort()).toEqual(["about", "contact", "faq", "product", "team"]);
  });

  it("doesn't let 200 product pages crowd out the rest (a Shopify-like site, 25 pages)", () => {
    const { picked } = simulate({ product: 200, collection: 20, faq: 2, about: 2, contact: 1, post: 40, blog: 1, policy: 6, other: 15 }, 24);
    expect(picked.product).toBeLessThanOrEqual(9);
    expect(picked.faq).toBe(2);
    expect(picked.about).toBe(2);
    expect(picked.post).toBeGreaterThanOrEqual(3);
    expect(picked.policy ?? 0).toBeLessThanOrEqual(1);
  });

  it("gives a small budget a sensible mix (10 pages)", () => {
    const { picked } = simulate({ services: 30, faq: 6, about: 1, team: 2, contact: 1, post: 30 }, 9);
    expect(picked).toMatchObject({ about: 1, contact: 1 });
    expect(picked.faq).toBeGreaterThanOrEqual(2);
    expect(picked.services).toBeGreaterThanOrEqual(2);
    expect(picked.team).toBeGreaterThanOrEqual(1);
  });

  it("uses spare budget when a site has few kinds of page", () => {
    const { picked } = simulate({ product: 100, about: 1 }, 30);
    expect(picked.about).toBe(1);
    expect(picked.product).toBe(29);
  });

  it("prefers pages closer to the homepage within a kind", () => {
    const queue = new Map<string, { depth: number; role: PageRole }>([
      ["https://x/faq/deep", { depth: 3, role: "faq" }],
      ["https://x/faq/near", { depth: 1, role: "faq" }],
    ]);
    expect(planNext(queue, {}, 10)).toBe("https://x/faq/near");
  });
});
