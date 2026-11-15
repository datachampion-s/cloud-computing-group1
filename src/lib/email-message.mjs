import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const images = [
  { cid: "hpc-logo@datachampions.tech", filename: "hpc-logo.png" },
  { cid: "powered-by-aws@datachampions.tech", filename: "powered-by-aws.png" },
];
const base64 = (value) =>
  Buffer.from(value)
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") || "";

const sanitizeHeader = (value) =>
  String(value ?? "").replace(/[\r\n]+/g, " ").trim();

export async function createEmailMessage({
  sender,
  recipient,
  subject,
  text,
  html,
}) {
  const safeSender = sanitizeHeader(sender);
  const safeRecipient = sanitizeHeader(recipient);
  const safeSubject = sanitizeHeader(subject);
  const id = randomUUID();
  const alternative = `dcs-alternative-${id}`;
  const related = `dcs-related-${id}`;
  const parts = [
    `From: DCS Compute <${safeSender}>`,
    `To: ${safeRecipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeSubject).toString("base64")}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@datachampions.tech>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(text),
    `--${alternative}`,
    `Content-Type: multipart/related; boundary="${related}"; type="text/html"`,
    "",
    `--${related}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(html),
  ];
  // Only attach fixed local brand assets referenced by this template.
  for (const { cid, filename } of images) {
    if (!html.includes(`cid:${cid}`)) continue;
    const image = await readFile(
      join(process.cwd(), "public", "images", filename),
    );
    parts.push(
      `--${related}`,
      `Content-Type: image/png; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${cid}>`,
      `Content-Disposition: inline; filename="${filename}"`,
      "",
      base64(image),
    );
  }
  parts.push(`--${related}--`, `--${alternative}--`, "");
  return parts.join("\r\n");
}
