const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");

const root = __dirname;
const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
const port = Number(process.env.PORT || 4173);
const setupStatePath = path.join(root, ".setup-complete.json");
const bundledPython = path.join(root, "tools", "python", "python.exe");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const englandExamBoards = [
  {
    board: "AQA",
    sourceName: "AQA official",
    hosts: ["aqa.org.uk", "filestore.aqa.org.uk"],
    searchUrls: [
      "https://www.aqa.org.uk/subjects",
      "https://www.aqa.org.uk/find-past-papers-and-mark-schemes",
      "https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300/assessment-resources"
    ]
  },
  {
    board: "OCR",
    sourceName: "OCR official",
    hosts: ["ocr.org.uk"],
    searchUrls: [
      "https://www.ocr.org.uk/qualifications/gcse/",
      "https://www.ocr.org.uk/qualifications/as-and-a-level/",
      "https://www.ocr.org.uk/qualifications/past-paper-finder/",
      "https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/assessment/"
    ]
  },
  {
    board: "Pearson Edexcel",
    sourceName: "Pearson Edexcel official",
    hosts: ["pearson.com", "qualifications.pearson.com"],
    searchUrls: [
      "https://qualifications.pearson.com/en/qualifications/edexcel-gcses.html",
      "https://qualifications.pearson.com/en/qualifications/edexcel-a-levels.html",
      "https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html"
    ]
  },
  {
    board: "WJEC Eduqas",
    sourceName: "WJEC Eduqas official",
    hosts: ["eduqas.co.uk", "wjec.co.uk"],
    searchUrls: [
      "https://www.eduqas.co.uk/qualifications/",
      "https://www.eduqas.co.uk/home/past-papers/",
      "https://www.wjec.co.uk/home/past-papers/"
    ]
  }
];

const supportedCatalogueSubjects = [
  "Accounting",
  "Ancient History",
  "Ancient Languages",
  "Arabic",
  "Art and Design",
  "Astronomy",
  "Bengali",
  "Biology",
  "Biblical Hebrew",
  "British Sign Language",
  "Business",
  "Chemistry",
  "Chinese",
  "Citizenship Studies",
  "Classical Civilisation",
  "Classical Greek",
  "Combined Science",
  "Computer Science",
  "Dance",
  "Design and Technology",
  "Drama",
  "Economics",
  "Electronics",
  "Engineering",
  "English Language",
  "English Literature",
  "Environmental Science",
  "Film Studies",
  "Food Preparation and Nutrition",
  "French",
  "Further Mathematics",
  "Geography",
  "Geology",
  "German",
  "Gujarati",
  "History",
  "Italian",
  "Japanese",
  "Latin",
  "Law",
  "Mathematics",
  "Media Studies",
  "Modern Foreign Languages",
  "Modern Hebrew",
  "Music",
  "Panjabi",
  "Persian",
  "Physical Education",
  "Physics",
  "Polish",
  "Politics",
  "Portuguese",
  "Psychology",
  "Religious Studies",
  "Russian",
  "Science",
  "Sociology",
  "Spanish",
  "Statistics",
  "Turkish",
  "Urdu"
];

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/convert-pdf-to-word") {
    if (!allowMethod(request, response, "GET")) return;
    await handlePdfConversion(url, response);
    return;
  }

  if (url.pathname === "/api/convert-pdf-to-text") {
    if (!allowMethod(request, response, "GET")) return;
    await handleTextConversion(url, response);
    return;
  }

  if (url.pathname === "/api/update-catalogue") {
    if (!allowMethod(request, response, "POST")) return;
    await handleCatalogueUpdate(response);
    return;
  }

  if (url.pathname === "/api/extract-answer-text") {
    if (!allowMethod(request, response, "POST")) return;
    await handleAnswerTextExtraction(request, response);
    return;
  }

  serveStatic(url, response);
});

function serveStatic(url, response) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(requestedPath)}`);

  if (filePath !== root && !filePath.startsWith(rootWithSeparator)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
}

function allowMethod(request, response, method) {
  if (request.method === method) {
    return true;
  }

  response.writeHead(405, {
    "Allow": method,
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(`Use ${method} for this endpoint.`);
  return false;
}

async function handlePdfConversion(url, response) {
  const source = url.searchParams.get("url");
  const title = url.searchParams.get("title") || "past-paper";

  if (!isHttpsPdfUrl(source)) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("A valid HTTPS PDF URL is required.");
    return;
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "paper-convert-"));
  const pdfPath = path.join(workDir, "source.pdf");
  const docxPath = path.join(workDir, `${safeFileName(title)}.docx`);

  try {
    await downloadFile(source, pdfPath);
    await runPdfToDocx(pdfPath, docxPath);
    const docx = await fsp.readFile(docxPath);
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeFileName(title)}.docx"`
    });
    response.end(docx);
  } catch (error) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`PDF-to-Word conversion failed. Restart the app and try again. Details: ${error.message}`);
  } finally {
    fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleTextConversion(url, response) {
  const source = url.searchParams.get("url");
  const title = url.searchParams.get("title") || "past-paper";

  if (!isHttpsPdfUrl(source)) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("A valid HTTPS PDF URL is required.");
    return;
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "paper-text-"));
  const pdfPath = path.join(workDir, "source.pdf");
  const textPath = path.join(workDir, `${safeFileName(title)}.txt`);

  try {
    await downloadFile(source, pdfPath);
    await runPdfToText(pdfPath, textPath, title);
    const text = await fsp.readFile(textPath);
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(title)}.txt"`
    });
    response.end(text);
  } catch (error) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Plain-text conversion failed. Restart the app and try again. Details: ${error.message}`);
  } finally {
    fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleCatalogueUpdate(response) {
  const cataloguePath = path.join(root, "data", "real-papers.json");

  try {
    const existing = JSON.parse(await fsp.readFile(cataloguePath, "utf8"));
    const discovery = await discoverCatalogueEntries(existing);
    const discovered = discovery.papers;
    const byKey = new Map();

    for (const paper of existing.concat(discovered)) {
      byKey.set(paperKey(paper), paper);
    }

    const merged = Array.from(byKey.values()).sort(sortPaper);
    await fsp.writeFile(cataloguePath, JSON.stringify(merged, null, 2), "utf8");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      added: Math.max(0, merged.length - existing.length),
      total: merged.length,
      searched: discovery.stats.searched,
      skipped: discovery.stats.skipped,
      pdfs: discovery.stats.pdfs
    }));
  } catch (error) {
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

async function handleAnswerTextExtraction(request, response) {
  try {
    const contentType = request.headers["content-type"] || "";
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!match) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Upload a file using multipart/form-data." }));
      return;
    }

    const body = await readRequestBody(request, 25 * 1024 * 1024);
    const upload = parseMultipartFile(body, match[1] || match[2]);

    if (!upload) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "No answer file was uploaded." }));
      return;
    }

    const text = extractAnswerText(upload.filename, upload.data);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      filename: upload.filename,
      text
    }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

async function ensureFirstRunSetup() {
  const alreadySetUp = await hasCompletedSetup();
  const converterAvailable = await canImportPdf2Docx();

  if (alreadySetUp && converterAvailable) {
    console.log("Local converter ready.");
    return;
  }

  console.log("First launch setup: installing local PDF-to-Word converter. This only runs when needed.");
  await runSetupInstall();

  if (!(await canImportPdf2Docx())) {
    throw new Error("Setup finished, but pdf2docx still could not be imported.");
  }

  await fsp.writeFile(setupStatePath, JSON.stringify({
    completedAt: new Date().toISOString(),
    tools: ["pdf2docx"]
  }, null, 2));
  console.log("First launch setup complete.");
}

async function hasCompletedSetup() {
  try {
    await fsp.access(setupStatePath);
    return true;
  } catch (error) {
    return false;
  }
}

function canImportPdf2Docx() {
  return new Promise((resolve) => {
    const child = spawn(getPythonCommand(), ["-c", "from pdf2docx import Converter"], {
      windowsHide: true
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runSetupInstall() {
  return new Promise((resolve, reject) => {
    const child = spawn(getPythonCommand(), ["-m", "pip", "install", "-r", path.join(root, "requirements.txt")], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pip install exited with code ${code}`));
      }
    });
  });
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        request.destroy(new Error("Uploaded file is too large. Keep answer files under 25 MB."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipartFile(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, delimiter);

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const rawHeaders = part.slice(0, headerEnd).toString("latin1");
    if (!/name="answerFile"/i.test(rawHeaders) && !/filename=/i.test(rawHeaders)) continue;

    const filenameMatch = rawHeaders.match(/filename="([^"]*)"/i);
    const filename = filenameMatch ? path.basename(filenameMatch[1]) : "answer";
    let data = part.slice(headerEnd + 4);

    if (data.slice(0, 2).toString("latin1") === "\r\n") {
      data = data.slice(2);
    }
    if (data.slice(-2).toString("latin1") === "\r\n") {
      data = data.slice(0, -2);
    }

    if (data.length > 0) {
      return { filename, data };
    }
  }

  return null;
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index;

  while ((index = buffer.indexOf(delimiter, start)) !== -1) {
    if (index > start) {
      parts.push(buffer.slice(start, index));
    }
    start = index + delimiter.length;
  }

  if (start < buffer.length) {
    parts.push(buffer.slice(start));
  }

  return parts;
}

function extractAnswerText(filename, data) {
  const extension = path.extname(filename).toLowerCase();

  if (extension === ".docx") {
    return extractDocxText(data);
  }
  if (extension === ".txt" || extension === ".html" || extension === ".htm") {
    return data.toString("utf8");
  }
  if (extension === ".rtf") {
    return stripRtf(data.toString("utf8"));
  }
  if (extension === ".doc") {
    throw new Error("Old .doc files are not supported yet. Save the answer as .docx, .txt, .rtf, or HTML and upload again.");
  }

  throw new Error("Unsupported answer file type. Upload .docx, .txt, .rtf, or HTML.");
}

function extractDocxText(buffer) {
  const xmlParts = [
    readZipEntry(buffer, "word/document.xml"),
    readZipEntry(buffer, "word/footnotes.xml"),
    readZipEntry(buffer, "word/endnotes.xml")
  ].filter(Boolean);

  if (xmlParts.length === 0) {
    throw new Error("This .docx file could not be read.");
  }

  return xmlParts.map(xmlToText).join("\n\n").trim();
}

function readZipEntry(buffer, entryName) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) return "";

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8").replace(/\\/g, "/");

    if (name === entryName) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);

      if (method === 0) return compressed.toString("utf8");
      if (method === 8) return zlib.inflateRawSync(compressed).toString("utf8");
      throw new Error("This .docx uses an unsupported ZIP compression method.");
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return "";
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function xmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>|<w:cr\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

function stripRtf(text) {
  return text
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ");
}

function downloadFile(source, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const request = https.get(source, requestOptions(source), (incoming) => {
      if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.headers.location) {
        file.close(() => {
          downloadFile(new URL(incoming.headers.location, source).toString(), destination).then(resolve, reject);
        });
        return;
      }
      if (incoming.statusCode !== 200) {
        reject(new Error(`PDF download returned HTTP ${incoming.statusCode}`));
        return;
      }
      incoming.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
    });
    request.setTimeout(60000, () => {
      request.destroy(new Error("PDF download timed out"));
    });
    request.on("error", reject);
  });
}

function runPdfToDocx(pdfPath, docxPath) {
  return new Promise((resolve, reject) => {
    const script = [
      "from pdf2docx import Converter",
      "import sys",
      "pdf, docx = sys.argv[1], sys.argv[2]",
      "converter = Converter(pdf)",
      "try:",
      "    converter.convert(docx)",
      "finally:",
      "    converter.close()"
    ].join("\n");
    const child = spawn(getPythonCommand(), ["-c", script, pdfPath, docxPath], {
      windowsHide: true
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `pdf2docx exited with code ${code}`));
      }
    });
  });
}

function runPdfToText(pdfPath, textPath, title) {
  return new Promise((resolve, reject) => {
    const script = [
      "import fitz, re, sys",
      "pdf, txt, title = sys.argv[1], sys.argv[2], sys.argv[3]",
      "doc = fitz.open(pdf)",
      "parts = [title, '=' * len(title), '']",
      "for page_index, page in enumerate(doc, start=1):",
      "    text = page.get_text('text', sort=True)",
      "    text = re.sub(r'[ \\t]+', ' ', text)",
      "    text = re.sub(r'\\n{3,}', '\\n\\n', text).strip()",
      "    if text:",
      "        parts.extend([f'Page {page_index}', '-' * 20, text, ''])",
      "doc.close()",
      "with open(txt, 'w', encoding='utf-8') as out:",
      "    out.write('\\n'.join(parts))"
    ].join("\n");
    const child = spawn(getPythonCommand(), ["-c", script, pdfPath, textPath, title], {
      windowsHide: true
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `text extraction exited with code ${code}`));
      }
    });
  });
}

async function discoverCatalogueEntries(existing) {
  const sourceUrls = new Set(existing.map((paper) => paper.sourceUrl).filter(Boolean));
  for (const target of catalogueSearchTargets()) {
    sourceUrls.add(target);
  }

  const pdfs = [];
  const queue = Array.from(sourceUrls);
  const queued = new Set(queue);
  const visited = new Set();
  const stats = { searched: 0, skipped: 0, pdfs: 0 };

  await crawlCatalogueQueue({ queue, queued, visited, pdfs, stats });

  return { papers: pairPdfLinks(pdfs), stats };
}

async function crawlCatalogueQueue({ queue, queued, visited, pdfs, stats }) {
  const workerCount = 8;
  let active = 0;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  async function runNext() {
    const sourceUrl = queue.shift();

    if (!sourceUrl) {
      if (active === 0) resolveDone();
      return;
    }

    if (visited.has(sourceUrl)) {
      runNext();
      return;
    }

    visited.add(sourceUrl);
    active += 1;

    try {
      const html = await fetchText(sourceUrl);
      stats.searched += 1;
      for (const href of extractPdfLinks(html, sourceUrl)) {
        pdfs.push({ href, sourceUrl });
        stats.pdfs += 1;
      }
      for (const linkedSource of extractCatalogueSourceLinks(html, sourceUrl)) {
        if (!queued.has(linkedSource) && !visited.has(linkedSource)) {
          queued.add(linkedSource);
          queue.push(linkedSource);
        }
      }
    } catch (error) {
      stats.skipped += 1;
      console.warn(`Catalogue source skipped: ${sourceUrl} (${error.message})`);
    } finally {
      active -= 1;
      runNext();
    }
  }

  for (let index = 0; index < workerCount; index += 1) {
    runNext();
  }

  await done;
}

function catalogueSearchTargets() {
  const targets = new Set();

  for (const board of englandExamBoards) {
    board.searchUrls.forEach((source) => targets.add(source));

    for (const subject of supportedCatalogueSubjects) {
      const slug = slugifySubject(subject);
      if (board.board === "AQA") {
        targets.add(`https://www.aqa.org.uk/subjects/${slug}/gcse`);
        targets.add(`https://www.aqa.org.uk/subjects/${slug}/as-and-a-level`);
      } else if (board.board === "OCR") {
        targets.add(`https://www.ocr.org.uk/qualifications/by-subject/${slug}/`);
      } else if (board.board === "Pearson Edexcel") {
        targets.add(`https://qualifications.pearson.com/en/subjects/${slug}.html`);
      } else if (board.board === "WJEC Eduqas") {
        targets.add(`https://www.eduqas.co.uk/qualifications/${slug}/`);
      }
    }
  }

  return Array.from(targets);
}

function fetchText(source) {
  return new Promise((resolve, reject) => {
    const request = https.get(source, requestOptions(source), (incoming) => {
      if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.headers.location) {
        fetchText(new URL(incoming.headers.location, source).toString()).then(resolve, reject);
        return;
      }
      if (incoming.statusCode !== 200) {
        reject(new Error(`HTTP ${incoming.statusCode}`));
        return;
      }

      let body = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk) => {
        body += chunk;
      });
      incoming.on("end", () => resolve(body));
    });
    request.setTimeout(60000, () => {
      request.destroy(new Error("Request timed out"));
    });
    request.on("error", reject);
  });
}

function extractPdfLinks(html, baseUrl) {
  const links = new Set();
  const pattern = /(?:href|data-url)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
  let match;

  while ((match = pattern.exec(html))) {
    links.add(new URL(match[1].replace(/&amp;/g, "&"), baseUrl).toString());
  }

  return Array.from(links);
}

function extractCatalogueSourceLinks(html, baseUrl) {
  const links = new Set();
  const base = new URL(baseUrl);
  const relevant = /(assessment|past-paper|past paper|question-paper|question paper|mark-scheme|mark scheme|resource|qualification)/i;
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const href = match[1].replace(/&amp;/g, "&");
    const label = match[2].replace(/<[^>]+>/g, " ");
    let url;
    try {
      url = new URL(href, baseUrl);
    } catch (error) {
      continue;
    }

    if (url.protocol !== "https:" || url.hostname !== base.hostname) continue;
    if (!relevant.test(`${url.pathname} ${url.search} ${label}`)) continue;
    links.add(url.toString());
  }

  return Array.from(links);
}

function pairPdfLinks(pdfs) {
  const candidates = new Map();

  for (const pdf of pdfs) {
    const meta = inferPaperMeta(pdf.href, pdf.sourceUrl);
    if (!meta) continue;
    const key = [
      meta.board,
      meta.qualification,
      meta.subject,
      meta.tier,
      meta.paperName,
      meta.series,
      meta.year
    ].join("|");
    const current = candidates.get(key) || meta;
    if (meta.kind === "question") current.questionUrl = pdf.href;
    if (meta.kind === "scheme") current.schemeUrl = pdf.href;
    candidates.set(key, current);
  }

  return Array.from(candidates.values())
    .filter((paper) => paper.questionUrl && paper.schemeUrl)
    .map(({ kind, ...paper }) => paper);
}

function inferPaperMeta(pdfUrl, sourceUrl) {
  const lower = pdfUrl.toLowerCase();
  const aqa = lower.match(/aqa-(\d{5})([hf]?)-(?:w-)?(qp|ms)-([a-z]{3})(\d{2})/);
  if (aqa) {
    return buildPaper({
      board: "AQA",
      qualification: "GCSE",
      subject: inferSubject(pdfUrl, sourceUrl),
      tier: tierFromCode(aqa[2]),
      paperNumber: aqa[1].slice(-1),
      year: `20${aqa[5]}`,
      series: seriesFromCode(aqa[4]),
      kind: aqa[3] === "qp" ? "question" : "scheme",
      sourceName: "AQA official",
      sourceUrl
    });
  }

  const edexcel = lower.match(/1ma1-(\d)([hf])-(que|rms)-(\d{8})/);
  if (edexcel) {
    const date = edexcel[4];
    return buildPaper({
      board: "Edexcel",
      qualification: "GCSE",
      subject: "Mathematics",
      tier: tierFromCode(edexcel[2]),
      paperNumber: edexcel[1],
      year: date.slice(0, 4),
      series: "June",
      kind: edexcel[3] === "que" ? "question" : "scheme",
      sourceName: "Pearson Edexcel via LumiExams",
      sourceUrl
    });
  }

  const ocr = lower.match(/(\d{6})-(question-paper|mark-scheme)-paper-(\d)/);
  if (ocr) {
    return buildPaper({
      board: "OCR",
      qualification: inferQualification(pdfUrl, sourceUrl),
      subject: inferSubject(pdfUrl, sourceUrl),
      tier: /j560|mathematics/.test(lower + " " + sourceUrl.toLowerCase()) ? (Number(ocr[3]) <= 3 ? "Foundation" : "Higher") : inferTier(pdfUrl, sourceUrl),
      paperNumber: ocr[3],
      year: inferYear(pdfUrl, sourceUrl),
      series: inferSeries(pdfUrl, sourceUrl),
      kind: ocr[2] === "question-paper" ? "question" : "scheme",
      sourceName: "OCR official",
      sourceUrl
    });
  }

  const generic = inferGenericPaperMeta(pdfUrl, sourceUrl);
  return generic;
}

function inferGenericPaperMeta(pdfUrl, sourceUrl) {
  const board = inferBoard(pdfUrl, sourceUrl);
  const subject = inferSubject(pdfUrl, sourceUrl);
  const kind = inferKind(pdfUrl);

  if (!board || !subject || !kind) return null;

  return buildPaper({
    board,
    qualification: inferQualification(pdfUrl, sourceUrl),
    subject,
    tier: inferTier(pdfUrl, sourceUrl),
    paperNumber: inferPaperNumber(pdfUrl),
    paperName: inferPaperName(pdfUrl),
    year: inferYear(pdfUrl, sourceUrl),
    series: inferSeries(pdfUrl, sourceUrl),
    kind,
    sourceName: sourceNameForBoard(board),
    sourceUrl
  });
}

function buildPaper(details) {
  const paperNames = {
    "1": "Paper 1 Non-calculator",
    "2": "Paper 2 Calculator",
    "3": "Paper 3 Calculator",
    "4": "Paper 4 Calculator",
    "5": "Paper 5 Non-calculator",
    "6": "Paper 6 Calculator"
  };
  const subject = details.subject || "Unknown subject";

  return {
    qualification: details.qualification,
    subject,
    board: details.board,
    tier: details.tier,
    paperName: details.paperName || paperNames[details.paperNumber] || `Paper ${details.paperNumber || 1}`,
    year: details.year,
    series: details.series,
    marks: defaultMarks(subject, details.board),
    sourceName: details.sourceName,
    sourceUrl: details.sourceUrl,
    questionUrl: "",
    schemeUrl: "",
    topics: topicsForSubject(subject),
    kind: details.kind
  };
}

function inferBoard(pdfUrl, sourceUrl) {
  const haystack = `${pdfUrl} ${sourceUrl}`.toLowerCase();
  const board = englandExamBoards.find((candidate) => candidate.hosts.some((host) => haystack.includes(host)));
  if (board) return board.board;
  if (haystack.includes("edexcel") || haystack.includes("pearson")) return "Pearson Edexcel";
  if (haystack.includes("eduqas") || haystack.includes("wjec")) return "WJEC Eduqas";
  if (haystack.includes("ocr")) return "OCR";
  if (haystack.includes("aqa")) return "AQA";
  return "";
}

function inferSubject(pdfUrl, sourceUrl) {
  const haystack = normaliseSubjectText(`${decodeURIComponent(pdfUrl)} ${decodeURIComponent(sourceUrl)}`);
  const aliases = {
    "Art and Design": ["art and design", "art-design", "art"],
    "British Sign Language": ["british sign language", "bsl"],
    "Citizenship Studies": ["citizenship studies", "citizenship"],
    "Classical Civilisation": ["classical civilisation", "classical civilization"],
    "Classical Greek": ["classical greek"],
    "Combined Science": ["combined science", "trilogy", "synergy"],
    "Computer Science": ["computer science", "computing"],
    "Design and Technology": ["design and technology", "design-technology", "d-and-t"],
    "English Language": ["english language"],
    "English Literature": ["english literature"],
    "Food Preparation and Nutrition": ["food preparation and nutrition", "food preparation", "food"],
    "Further Mathematics": ["further mathematics", "further maths"],
    "Modern Foreign Languages": ["modern foreign languages"],
    "Physical Education": ["physical education", "pe"],
    "Religious Studies": ["religious studies", "religion"],
    "Single Science": ["single science"]
  };

  for (const [subject, subjectAliases] of Object.entries(aliases)) {
    if (subjectAliases.some((alias) => haystack.includes(alias))) return subject;
  }

  const subjects = supportedCatalogueSubjects
    .filter((subject) => !["Science", "Modern Foreign Languages"].includes(subject))
    .sort((a, b) => b.length - a.length);
  const match = subjects.find((subject) => haystack.includes(normaliseSubjectText(subject)));
  return match || "Mathematics";
}

function inferKind(pdfUrl) {
  const lower = pdfUrl.toLowerCase();
  if (/(mark[-_ ]?scheme|[^a-z]ms[^a-z]|rms|answers?)/.test(lower)) return "scheme";
  if (/(question[-_ ]?paper|[^a-z]qp[^a-z]|que|exam[-_ ]?paper)/.test(lower)) return "question";
  return "";
}

function inferQualification(pdfUrl, sourceUrl) {
  const lower = `${pdfUrl} ${sourceUrl}`.toLowerCase();
  if (/(international[-_ ]?gcse|igcse)/.test(lower)) return "IGCSE";
  if (/(a[-_ ]?level|gce|advanced)/.test(lower)) return "A-level";
  if (/(^|[^a-z])as([^a-z]|$)/.test(lower)) return "AS";
  return "GCSE";
}

function inferTier(pdfUrl, sourceUrl) {
  const lower = `${pdfUrl} ${sourceUrl}`.toLowerCase();
  if (/(foundation|[^a-z]f[-_.]|[-_.]f[-_.]|foundation-tier)/.test(lower)) return "Foundation";
  if (/(higher|[^a-z]h[-_.]|[-_.]h[-_.]|higher-tier)/.test(lower)) return "Higher";
  return "Untiered";
}

function inferPaperNumber(pdfUrl) {
  const lower = pdfUrl.toLowerCase();
  const match = lower.match(/(?:paper|component|unit)[-_ ]?(\d{1,2}[a-z]?)/) || lower.match(/[-_](\d{1,2})(?:h|f)?[-_]/);
  return match ? match[1].toUpperCase() : "";
}

function inferPaperName(pdfUrl) {
  const number = inferPaperNumber(pdfUrl);
  if (!number) return "";
  const lower = pdfUrl.toLowerCase();
  const suffixes = [];
  if (lower.includes("non-calculator") || lower.includes("non_calculator")) suffixes.push("Non-calculator");
  if (lower.includes("calculator")) suffixes.push("Calculator");
  if (lower.includes("listening")) suffixes.push("Listening");
  if (lower.includes("reading")) suffixes.push("Reading");
  if (lower.includes("writing")) suffixes.push("Writing");
  return `Paper ${number}${suffixes.length ? ` ${suffixes.join(" ")}` : ""}`;
}

function inferYear(pdfUrl, sourceUrl) {
  const lower = `${pdfUrl} ${sourceUrl}`.toLowerCase();
  const full = lower.match(/20\d{2}/);
  if (full) return full[0];
  const short = lower.match(/(?:jan|january|jun|june|nov|november|may|summer|autumn)[-_ ]?(\d{2})/);
  if (short) return `20${short[1]}`;
  return String(new Date().getFullYear());
}

function inferSeries(pdfUrl, sourceUrl) {
  const lower = `${pdfUrl} ${sourceUrl}`.toLowerCase();
  if (/(jan|january)/.test(lower)) return "January";
  if (/(may|jun|june|summer)/.test(lower)) return "June";
  if (/(oct|nov|november|autumn)/.test(lower)) return "November";
  return "Summer";
}

function topicsForSubject(subject) {
  const topics = {
    "Biology": ["cells", "organisation", "infection", "bioenergetics", "homeostasis", "ecology"],
    "Business": ["enterprise", "marketing", "finance", "operations", "people"],
    "Chemistry": ["atomic structure", "bonding", "quantitative chemistry", "energetics", "organic chemistry"],
    "Computer Science": ["algorithms", "programming", "data", "systems", "networks"],
    "English Language": ["reading", "analysis", "comparison", "writing", "evaluation"],
    "English Literature": ["drama", "poetry", "prose", "context", "essay structure"],
    "Geography": ["physical geography", "human geography", "fieldwork", "geographical skills"],
    "History": ["knowledge", "sources", "interpretations", "change", "causation"],
    "Mathematics": ["number", "algebra", "ratio", "geometry", "probability", "statistics"],
    "Physics": ["energy", "electricity", "particles", "forces", "waves", "magnetism"],
    "Science": ["biology", "chemistry", "physics", "practical skills"]
  };
  return topics[subject] || ["knowledge", "application", "analysis", "evaluation", "exam technique"];
}

function defaultMarks(subject, board) {
  if (subject === "Mathematics" && board === "OCR") return 100;
  if (subject === "Mathematics") return 80;
  return 60;
}

function sourceNameForBoard(board) {
  return englandExamBoards.find((candidate) => candidate.board === board)?.sourceName || `${board} official`;
}

function isHttpsPdfUrl(source) {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.pathname.toLowerCase().endsWith(".pdf");
  } catch (error) {
    return false;
  }
}

function requestOptions(source) {
  const url = new URL(source);
  return {
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    protocol: url.protocol,
    headers: {
      "User-Agent": "PastPaperRevisionHub/1.0 (+https://localhost)",
      "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8"
    }
  };
}

function slugifySubject(subject) {
  return subject.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normaliseSubjectText(value) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tierFromCode(code) {
  return code.toLowerCase() === "f" ? "Foundation" : "Higher";
}

function seriesFromCode(code) {
  const series = {
    jun: "June",
    nov: "November"
  };
  return series[code.toLowerCase()] || code.toUpperCase();
}

function paperKey(paper) {
  return [
    paper.board,
    paper.qualification,
    paper.subject,
    paper.tier,
    paper.paperName,
    paper.series,
    paper.year
  ].join("|");
}

function sortPaper(a, b) {
  return `${a.qualification} ${a.subject} ${a.board} ${a.tier} ${a.year} ${a.paperName}`
    .localeCompare(`${b.qualification} ${b.subject} ${b.board} ${b.tier} ${b.year} ${b.paperName}`);
}

function getPythonCommand() {
  if (process.env.PPRH_PYTHON) {
    return process.env.PPRH_PYTHON;
  }
  if (fs.existsSync(bundledPython)) {
    return bundledPython;
  }
  return "python";
}

function safeFileName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "past-paper";
}

ensureFirstRunSetup()
  .catch((error) => {
    console.warn(`Automatic setup did not complete: ${error.message}`);
    console.warn("The app will still start, but Word conversion may fail until setup.ps1 is run.");
  })
  .finally(() => {
    server.listen(port, "127.0.0.1", () => {
      console.log(`Past Paper Revision Hub running at http://127.0.0.1:${port}/`);
    });
  });
