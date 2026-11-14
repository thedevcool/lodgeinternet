import type { MetadataRoute } from "next";
import { fetchBlog } from "@/lib/blog";
import { LEGAL_LINKS } from "@/lib/legal";

/**
 * /sitemap.xml — the public pages search engines should know about: the
 * main pages, the legal pages and every live blog post. Hostel pages aren't
 * listed one by one; search engines reach them from /hostels.
 */
const SITE = "https://www.lodgeinternet.com";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blog = await fetchBlog();
  const pages = ["", "/hostels", "/support", "/legal", ...LEGAL_LINKS.map((l) => `/legal/${l.slug}`)];
  return [
    ...pages.map((path) => ({ url: `${SITE}${path}` })),
    ...(blog?.posts.length ? [{ url: `${SITE}/blog` }] : []),
    ...(blog?.posts ?? []).map((post) => ({
      url: `${SITE}/blog/${post.slug}`,
      lastModified: post.updated ?? post.published ?? undefined,
    })),
  ];
}
