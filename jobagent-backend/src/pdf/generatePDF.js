const puppeteer = require("puppeteer-core");

const CHROMIUM_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROMIUM_PATH ||
  "/usr/bin/chromium";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSectionHeader(line) {
  if (line.endsWith(":")) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function buildHtml(resumeText, candidateName) {
  const lines = String(resumeText || "").split(/\r?\n/);
  const nameLine = (lines[0] || candidateName || "").trim();
  const bodyLines = lines.slice(1);

  const bodyHtml = bodyLines
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return '<div style="height:8px;"></div>';
      if (isSectionHeader(line)) {
        return `<div class="section-header">${escapeHtml(line.replace(/:$/, ""))}</div>`;
      }
      if (line.startsWith("-")) {
        return `<div class="bullet">${escapeHtml(line)}</div>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(candidateName || nameLine || "Resume")}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: #222;
    margin: 0;
    padding: 0;
  }
  .page {
    max-width: 750px;
    margin: 0 auto;
    padding: 40px;
  }
  .name {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .section-header {
    font-size: 12px;
    font-weight: bold;
    border-bottom: 1px solid #ccc;
    margin-top: 16px;
    padding-bottom: 2px;
    text-transform: uppercase;
  }
  .bullet {
    margin-left: 16px;
    margin-bottom: 2px;
  }
  p {
    margin: 2px 0;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="name">${escapeHtml(nameLine)}</div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

async function generatePDF(resumeText, candidateName) {
  const html = buildHtml(resumeText, candidateName);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfBytes = await page.pdf({
      format: "Letter",
      margin: { top: "0.5in", right: "0.75in", bottom: "0.5in", left: "0.75in" },
      printBackground: false,
    });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

module.exports = { generatePDF };
