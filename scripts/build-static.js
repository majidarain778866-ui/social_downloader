import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { platforms } from "../public/platforms.js";
import { blogs } from "../public/blogs.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "..");
const publicDir = join(rootDir, "public");
const distDir = join(rootDir, "dist");
const siteUrl = (process.env.SITE_URL || "https://socialdownloader.app").replace(/\/+$/, "");
const publicApiBase = (process.env.PUBLIC_API_BASE || "").replace(/\/+$/, "");

const seoPages = {};

// Map all platforms
for (const [key, p] of Object.entries(platforms)) {
  seoPages[p.route] = {
    title: p.title,
    description: p.description,
    canonical: p.route,
    pageKey: p.key
  };
}

// Map Blog Home
seoPages["/blog"] = {
  title: "Social Media Downloader News & Guides - Social Downloader",
  description: "Read in-depth comparisons, tutorials, reviews, and updates about social media video downloaders, AI tools, and digital platforms.",
  canonical: "/blog",
  pageKey: "blog"
};

// Map individual blogs
for (const blog of blogs) {
  seoPages[`/blog/${blog.slug}`] = {
    title: `${blog.title} - Social Downloader`,
    description: blog.excerpt,
    canonical: `/blog/${blog.slug}`,
    pageKey: "blog-detail",
    blogSlug: blog.slug
  };
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const absoluteUrl = (path) => `${siteUrl}${path}`;

const buildSchema = (page) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${absoluteUrl("/")}#website`,
      name: "Social Downloader",
      url: absoluteUrl("/")
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${absoluteUrl(page.canonical)}#app`,
      name: "Social Downloader",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      description: page.description,
      url: absoluteUrl(page.canonical),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    }
  ]
});

const renderPage = (template, page) => {
  const meta = platforms[page.pageKey] || platforms.home;
  const theme = meta.theme || platforms.home.theme;

  const stepsHtml = (meta.howToUse?.steps || platforms.home.howToUse.steps)
    .map(
      (step, i) => `
      <div class="step-card">
        <div class="step-icon-wrapper">
          <span class="material-symbols-outlined step-icon" id="step-${i + 1}-icon">${escapeHtml(step.icon)}</span>
          <span class="step-number">0${i + 1}</span>
        </div>
        <div class="step-info">
          <h3 id="step-${i + 1}-title">${escapeHtml(step.title)}</h3>
          <p id="step-${i + 1}-desc">${escapeHtml(step.desc)}</p>
        </div>
      </div>`
    )
    .join("\n");

  const faqHtml = (meta.faq || platforms.home.faq)
    .map(
      (item, i) => `
      <details${i === 0 ? " open" : ""}>
        <summary>${escapeHtml(item.question)}</summary>
        <p>${escapeHtml(item.answer)}</p>
      </details>`
    )
    .join("\n");

  const allToolsHtml = Object.values(platforms)
    .filter((p) => p.key !== "home" && p.key !== "blog" && p.key !== "blog-detail")
    .map((p) => `
      <div class="keyword-tool-card glass-panel" style="--accent-color: ${escapeHtml(p.theme["--theme-accent"] || "#8b5cf6")}">
        <span class="material-symbols-outlined keyword-tool-icon" style="color: ${escapeHtml(p.theme["--theme-accent"] || "#8b5cf6")}">${escapeHtml(p.icon)}</span>
        <span class="keyword-tool-title">${escapeHtml(p.title.split(" - ")[0])}</span>
      </div>`
    )
    .join("\n");

  const blogsHtml = blogs
    .map(
      (post) => `
      <article class="blog-card glass-panel">
        <div class="blog-card-meta">
          <span class="blog-card-category">${escapeHtml(post.category)}</span>
          <span>•</span>
          <span>${escapeHtml(post.date)}</span>
        </div>
        <a href="/blog/${post.slug}">
          <h3>${escapeHtml(post.title)}</h3>
        </a>
        <p>${escapeHtml(post.excerpt)}</p>
        <a class="blog-card-link" href="/blog/${post.slug}">
          <span>Read article</span>
          <span class="material-symbols-outlined">arrow_forward</span>
        </a>
      </article>`
    )
    .join("\n");

  let html = template
    .replaceAll("__PAGE_TITLE__", escapeHtml(page.title))
    .replaceAll("__PAGE_DESCRIPTION__", escapeHtml(page.description))
    .replaceAll("__PAGE_CANONICAL__", escapeHtml(absoluteUrl(page.canonical)))
    .replaceAll("__PAGE_KEY__", escapeHtml(page.pageKey))
    .replaceAll("__APP_SCHEMA__", JSON.stringify(buildSchema(page)).replace(/</g, "\\u003c"))
    .replaceAll(
      "__API_BASE_SCRIPT__",
      publicApiBase
        ? `<script>window.SOCIAL_DOWNLOADER_API_BASE=${JSON.stringify(publicApiBase).replace(/</g, "\\u003c")};</script>`
        : ""
    )
    .replaceAll("__THEME_A__", theme["--theme-a"])
    .replaceAll("__THEME_B__", theme["--theme-b"])
    .replaceAll("__THEME_ACCENT__", theme["--theme-accent"])
    .replaceAll("__THEME_HOT__", theme["--theme-hot"])
    .replaceAll("__THEME_BUTTON__", theme["--theme-button"])
    .replaceAll("__THEME_CTA__", theme["--theme-cta"])
    .replaceAll("__PAGE_EYEBROW__", escapeHtml(meta.eyebrow || "Creator media workspace"))
    .replaceAll("__PAGE_HERO_TITLE__", escapeHtml(meta.heroTitle || meta.title || "Download clean social media assets."))
    .replaceAll("__PAGE_HERO_SUBTITLE__", escapeHtml(meta.heroSubtitle || meta.description || ""))
    .replaceAll("__INPUT_PLACEHOLDER__", escapeHtml(meta.placeholder || "Paste TikTok, Instagram, YouTube..."))
    .replaceAll("__BRAND_BADGE__", escapeHtml(meta.badge || "SD"))
    .replaceAll("__SUPPORTED_TITLE__", escapeHtml((meta.title || "Social Media Video").split(" - ")[0]))
    .replaceAll("__SUPPORTED_COPY__", escapeHtml(meta.description || ""))
    .replaceAll("__HOW_TO_USE_STEPS__", stepsHtml)
    .replaceAll("__ALL_TOOLS_GRID__", allToolsHtml)
    .replaceAll("__FAQ_LIST__", faqHtml)
    .replaceAll("__BLOGS_LIST_CONTAINER__", blogsHtml);

  if (page.pageKey === "blog-detail" && page.blogSlug) {
    const post = blogs.find((b) => b.slug === page.blogSlug);
    if (post) {
      html = html
        .replaceAll("__BLOG_TITLE__", escapeHtml(post.title))
        .replaceAll("__BLOG_AUTHOR__", escapeHtml(post.author))
        .replaceAll("__BLOG_DATE__", escapeHtml(post.date))
        .replaceAll("__BLOG_READ_TIME__", escapeHtml(post.readTime))
        .replaceAll("__BLOG_EXCERPT__", escapeHtml(post.excerpt))
        .replaceAll("__BLOG_CONTENT__", post.content);
    }
  }

  return html;
};

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });

const indexTemplate = await readFile(join(publicDir, "index.html"), "utf8");
const blogListTemplate = await readFile(join(publicDir, "blog-list.html"), "utf8");
const blogDetailTemplate = await readFile(join(publicDir, "blog-detail.html"), "utf8");

for (const [route, page] of Object.entries(seoPages)) {
  const outputDir = route === "/" ? distDir : join(distDir, route.slice(1));
  await mkdir(outputDir, { recursive: true });

  let activeTemplate = indexTemplate;
  if (page.pageKey === "blog") {
    activeTemplate = blogListTemplate;
  } else if (page.pageKey === "blog-detail") {
    activeTemplate = blogDetailTemplate;
  }

  await writeFile(join(outputDir, "index.html"), renderPage(activeTemplate, page));
}

// Generate sitemap.xml
const now = new Date().toISOString().slice(0, 10);
const sitemapUrls = Object.values(seoPages)
  .map(
    (page) => `  <url>
    <loc>${escapeHtml(absoluteUrl(page.canonical))}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.pageKey === "home" ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("\n");

await writeFile(
  join(distDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`
);

// Generate robots.txt
await writeFile(
  join(distDir, "robots.txt"),
  `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${absoluteUrl("/sitemap.xml")}
`
);

// Generate Netlify redirects (_redirects)
const redirectRules = [];
redirectRules.push("/api/video-info /.netlify/functions/api 200");
redirectRules.push("/api/download /.netlify/functions/api 200");

// Add redirect for each canonical page to normalize trailing slash
for (const page of Object.values(seoPages)) {
  if (page.canonical !== "/") {
    redirectRules.push(`${page.canonical} ${page.canonical}/ 200`);
  }
}

await writeFile(join(distDir, "_redirects"), redirectRules.join("\n") + "\n");

console.log(`Built static site in ${distDir} with all 50+ tools and blogs.`);
