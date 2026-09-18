import { Buffer } from "node:buffer";
import type { Express } from "express";

export const LIGHTHOUSE_SITEMAP_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/lighthouse</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/docket</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/civic-genome</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/legal-library</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/benefits</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/discover</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/resources</loc></url>",
  "  <url><loc>https://lighthouse.columbiacitycustomllc.com/resource-directory</loc></url>",
  "</urlset>",
].join("\n");

export const LIGHTHOUSE_FAVICON_ICO = Buffer.from(
  "AAABAAIAEBAAAAAAIABzAgAAJgAAACAgAAAAACAA4AAAAJkCAACJUE5HDQoaCgAAAA1JSERSAAAAEAAAABAIBgAAAB/z/2EAAAI6SURBVHicpZO9a1RBFMV/MzvvvU2W3WzMRt2YjTwxil+FgpUgBgVrRRH/BisRsbESAiIKVjaKiEUEK1sLrUQUCwU7/wCDJpDEJPv15s2xeCRmSToPXIZ7Zjjcc+9cM95MZa0hBCEGYa1FKtiNcwPGFOHyAOvdnHJsiSODBHkoHnc6Hay1GGOIoggknDP4XPT6Ig/C7qqVuHC6RhwZFpc9K2se50qsr/3h2tXLvJ57QRQ5DAEfYH4xo9sLpJMJM6eqmIPTB/Xl6RF6PvDy/RIfv63x5t0CeyYm+fH9A7VKzIPHz7hz8xaHDje5dLbGuZNVzpyt8/LVr8JCfaQEY0PcPlGFAJ/e/qRfPkbVzJN3HDeu7KPVPc71i3tgKoF2DmVL5AyunwXuPZ8nSSx5JmJnsabH+ZkIs/oViyHRCl4xj+bm6fuioW64xOevqzC2N5WttGSGi4hGUsGQ7s4+kSQFScttqdI4KqIJ2cqUTKUlM9TS8Oh+OWNg92i0OR7nHL+zhJFyD5SDhPXrTDQcSy4iilwxUgMhCAfg8y0zNiLzIsiAKQECU8LnwufCWA38Cct/YkcBY8yO3E78NoEQAiHLCCEM8N57vPfbBNzWRBLlckJttE6SJEj//NZqVfIgsqw/uBeNZqpGM9Xe1rRsUtfs/Ydqt9vq9Xraim63q98Li0qnT6g+PqXxiQNqNFMNVLBhIc8DnU4XaztFZQjnHD7327ey0Uw3GUkkSUIcx5iicxs3SIDEers9IPIX3hQkSMyiNG4AAAAASUVORK5CYIKJUE5HDQoaCgAAAA1JSERSAAAAIAAAACAIBgAAAHN6evQAAACnSURBVHicYxSRVPzPMICAaSAtH3UAVRzw+tk96jjg9RZ9si0nxxEw+1iwCTIwMDCI+lwkynJkvqiUElGWIgMWLOpIdgyplhLlAGyGwByCK8iRQ4HYKGWEFUQkpwGj9Zhi5wJJMkLU5yJxIYAVkGgZLsBITlGML9UTSojoYOgXRKMOGHXAqIANGHTDqgFEHUAqIqo4pafkSqp4HPARGHUBWk4yaYMBDAACt8DhVKew4SAAAAABJRU5ErkJggg==",
  "base64",
);

export function mountPlatformStaticDocuments(app: Express): void {
  app.get("/sitemap.xml", (_req, res) => {
    res
      .status(200)
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(LIGHTHOUSE_SITEMAP_XML);
  });

  app.get("/favicon.ico", (_req, res) => {
    res
      .status(200)
      .type("image/x-icon")
      .set("Cache-Control", "public, max-age=86400")
      .send(LIGHTHOUSE_FAVICON_ICO);
  });
}
