import {
  assertOrigin,
  database,
  failure,
  jsonBody,
  limited,
} from "@/lib/server";
import { validateApplication } from "@/lib/validation.mjs";
import { after } from "next/server";
import { notifyNewApplication } from "@/lib/application-notifications.mjs";
import { sendTransactionalEmail } from "@/lib/mail";
export const maxDuration = 60;
export async function POST(request) {
  try {
    assertOrigin(request);
    const body = await jsonBody(request);
    if (body.website)
      return Response.json(
        { error: "The application is invalid." },
        { status: 400 },
      );
    const result = validateApplication(body);
    if (!result.valid)
      return Response.json(
        {
          error: "Please review your application details.",
          errors: result.errors,
        },
        { status: 400 },
      );
    await limited(request, "apply", 5);
    const db = database();
    const v = result.value;
    const notificationEmail =
      process.env.APPLICATION_NOTIFICATION_EMAIL?.trim();
    if (
      !notificationEmail ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notificationEmail)
    )
      throw new Error("DATABASE_UNAVAILABLE");
    // The application and its durable email event commit together.
    const { data, error } = await db.rpc("portal_submit_application", {
      p_application: v,
      p_notification_email: notificationEmail,
    });
    if (error || !data?.id) throw new Error("DATABASE_UNAVAILABLE");
    if (data.email_event_id) {
      const origin = process.env.APP_URL || new URL(request.url).origin;
      after(async () => {
        try {
          await notifyNewApplication({
            applicationId: data.id,
            eventId: data.email_event_id,
            origin,
            db,
            deliver: sendTransactionalEmail,
          });
        } catch {
          // Delivery failure is recorded in email_events; the saved application remains valid.
          console.error("New application notification delivery failed", {
            applicationId: data.id,
          });
        }
      });
    }
    return Response.json(
      { reference: `DCS-${data.id.slice(0, 8).toUpperCase()}` },
      { status: data.created ? 201 : 200 },
    );
  } catch (error) {
    return failure(error);
  }
}
