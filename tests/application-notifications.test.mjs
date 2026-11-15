import test from "node:test";
import assert from "node:assert/strict";
import {
  newApplicationEmail,
  notifyNewApplication,
} from "../src/lib/application-notifications.mjs";

const application = {
  id: "cd04e138-9319-407d-b093-e1fcde66751c",
  applicant_name: "Student <script>alert(1)</script>",
  applicant_email: "student@example.com",
  program: "Statistics and Data Science",
  project_title: "Research & model evaluation",
  student_id: "PRIVATE_STUDENT_ID",
  ktm_drive_url: "PRIVATE_DOCUMENT_LINK",
};

test("notification escapes applicant content and links to the production admin route", () => {
  const email = newApplicationEmail(
    application,
    "https://hpc.datachampions.tech",
  );
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("Research &amp; model evaluation"));
  assert.ok(
    email.html.includes(
      `https://hpc.datachampions.tech/admin/applications/${application.id}`,
    ),
  );
  assert.ok(email.text.includes("3 business days"));
  for (const privateValue of [
    application.student_id,
    application.ktm_drive_url,
  ]) {
    assert.ok(!email.text.includes(privateValue));
    assert.ok(!email.html.includes(privateValue));
  }
});

test("a duplicate or in-flight email claim never calls delivery", async () => {
  const result = await notifyNewApplication({
    applicationId: application.id,
    eventId: "email-event",
    origin: "https://hpc.datachampions.tech",
    db: {
      rpc: async () => ({ data: false, error: null }),
      from: () => {
        throw new Error("Unexpected read");
      },
    },
    deliver: () => {
      throw new Error("Duplicate email attempted");
    },
  });
  assert.deepEqual(result, { skipped: true });
});

function notificationDatabase() {
  const updates = [];
  return {
    updates,
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        update(value) {
          updates.push(value);
          return this;
        },
        single: async () => ({
          data:
            table === "applications"
              ? application
              : { recipient: "notification@example.org" },
          error: null,
        }),
      };
    },
  };
}

test("claimed notifications use the stored recipient and persisted application", async () => {
  let message;
  const result = await notifyNewApplication({
    applicationId: application.id,
    eventId: "email-event",
    origin: "https://hpc.datachampions.tech",
    db: notificationDatabase(),
    deliver: async (value) => {
      message = value;
      return { sent: true };
    },
  });
  assert.equal(message.recipient, "notification@example.org");
  assert.equal(message.eventId, "email-event");
  assert.equal(message.template, "new_application");
  assert.equal(result.sent, true);
});

test("delivery failure retries once and remains recorded as failed", async () => {
  const db = notificationDatabase();
  let attempts = 0;
  await assert.rejects(
    notifyNewApplication({
      applicationId: application.id,
      eventId: "email-event",
      origin: "https://hpc.datachampions.tech",
      db,
      deliver: async () => {
        attempts++;
        throw new Error("Provider unavailable");
      },
    }),
    /APPLICATION_NOTIFICATION_FAILED/,
  );
  assert.equal(attempts, 2);
  assert.equal(db.updates.length, 2);
  assert.ok(db.updates.every((update) => update.delivery_status === "failed"));
});
