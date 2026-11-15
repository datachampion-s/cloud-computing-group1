import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEmailMessage } from "../src/lib/email-message.mjs";
import { newApplicationEmail } from "../src/lib/application-notifications.mjs";

const addresses = {
  sender: "sender@example.com",
  recipient: "admin@example.com",
};

async function assertInlinePng(message, cid, filename) {
  const part = message.split(`Content-ID: <${cid}>`)[1];
  assert.ok(part, `Missing MIME image for ${cid}`);
  assert.ok(
    part.startsWith(`\r\nContent-Disposition: inline; filename="${filename}"`),
  );
  const encoded = part.split("\r\n\r\n")[1].split("\r\n--")[0];
  assert.ok(encoded.split("\r\n").every((line) => line.length <= 76));
  assert.deepEqual(
    Buffer.from(encoded, "base64"),
    await readFile(new URL(`../public/images/${filename}`, import.meta.url)),
  );
}

test("notification emails contain the original logo bytes during local development and production", async () => {
  for (const origin of [
    "http://localhost:3000",
    "https://hpc.datachampions.tech",
  ]) {
    const email = newApplicationEmail(
      {
        id: "cd04e138-9319-407d-b093-e1fcde66751c",
        applicant_name: "Research student",
        applicant_email: "student@example.com",
        program: "Mathematics",
        project_title: "Model evaluation",
      },
      origin,
    );
    assert.ok(email.html.includes('src="cid:hpc-logo@datachampions.tech"'));
    assert.ok(!email.html.includes(`${origin}/images/`));
    assert.ok(email.html.includes(`${origin}/admin/applications/`));
    const message = await createEmailMessage({ ...addresses, ...email });
    assert.ok(message.includes("Content-Type: multipart/alternative;"));
    assert.ok(message.includes("Content-Type: multipart/related;"));
    assert.ok(message.includes('type="text/html"'));
    await assertInlinePng(
      message,
      "hpc-logo@datachampions.tech",
      "hpc-logo.png",
    );
    assert.ok(
      !message.includes("Content-ID: <powered-by-aws@datachampions.tech>"),
    );
  }
});

test("emails referencing both brands include both inline PNGs", async () => {
  const message = await createEmailMessage({
    ...addresses,
    subject: "DCS — Confirm your session",
    text: "Confirm your research session.",
    html: '<img src="cid:hpc-logo@datachampions.tech"><img src="cid:powered-by-aws@datachampions.tech">',
  });
  await assertInlinePng(message, "hpc-logo@datachampions.tech", "hpc-logo.png");
  await assertInlinePng(
    message,
    "powered-by-aws@datachampions.tech",
    "powered-by-aws.png",
  );
  const subject = message.match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)[1];
  assert.equal(
    Buffer.from(subject, "base64").toString(),
    "DCS — Confirm your session",
  );
});
