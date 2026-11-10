import { Hono } from "hono";

export const seoRoutes = new Hono();

seoRoutes.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${origin}/sitemap.xml`);
});

seoRoutes.get("/sitemap.xml", (c) => {
  const origin = new URL(c.req.url).origin;
  const pages = ["", "/rooms", "/availability", "/contact", "/faq"];
  c.header("Content-Type", "application/xml");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`);
});
