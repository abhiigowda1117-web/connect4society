/**
 * Reminder emails to students who registered on the spot but have not uploaded yet.
 *
 * Add this as a second file in the same Apps Script project (Files → + → Script → "Reminders"),
 * then pick a function from the toolbar and press Run:
 *   previewReminders  – lists who would get the email. Sends nothing.
 *   sendReminders     – emails each of them, from connect4society@gmail.com.
 * A student is emailed at most once per reminder round (REMINDER_ROUND), so pressing Run again
 * only reaches students not emailed yet.
 *
 * Uses readRegistrations_ / findSubmission_ from Code.gs.
 */

const REMINDER_DATES = ["21/11/2026", "22/11/2026"];   // registration dates to include (dd/MM/yyyy)
const REMINDER_DEADLINE = "today, 23 November 2026, before 11:59 PM";
const REMINDER_ROUND = "2026-11-23";                     // change this to send a fresh round later
// USNs never to remind (e.g. a typo in registration where the student already submitted under the right USN)
const REMINDER_SKIP = ["1EP23OS013"];
const UPLOAD_LINK = "https://abhiigowda1117-web.github.io/connect4society/upload.html";

/** Students registered on REMINDER_DATES with no submission yet. */
function pendingStudents_() {
  const seen = {};
  readRegistrations_().forEach(r => {
    const day = String(r.registered || "").split(" ")[0];
    if (REMINDER_DATES.indexOf(day) < 0 || seen[r.usn] || REMINDER_SKIP.indexOf(r.usn) >= 0) return;
    seen[r.usn] = r;
  });
  return Object.keys(seen).map(u => seen[u]).filter(r => !findSubmission_(r.usn));
}

function previewReminders() {
  const list = pendingStudents_();
  const sent = sentSet_();
  Logger.log(list.length + " students have not uploaded:");
  list.forEach((r, i) => Logger.log((i + 1) + ". " + r.usn + " | " + r.name + " | " + (r.email || "NO EMAIL") +
    (sent[r.usn] ? " | already emailed this round" : "")));
  Logger.log("Emails left today on this account: " + MailApp.getRemainingDailyQuota());
}

function sendReminders() {
  const list = pendingStudents_();
  const sent = sentSet_();
  let count = 0, skipped = 0;
  list.forEach(r => {
    if (sent[r.usn] || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) { skipped++; return; }
    if (MailApp.getRemainingDailyQuota() < 1) { Logger.log("Daily email limit reached; run again tomorrow."); return; }
    const first = (r.name.split(/\s+/)[0] || "Student");
    const name = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    MailApp.sendEmail({
      to: r.email,
      name: "Connect4Society",
      subject: "Action needed: upload your AICTE activity photos and certificates",
      htmlBody:
        "<p>Dear " + esc_(name) + ",</p>" +
        "<p>You registered for the <b>AICTE Activity Points programme</b> with Connect4Society (USN <b>" + esc_(r.usn) +
        "</b>), but we have not yet received your activity photos and certificates. Your AICTE report cannot be prepared without them.</p>" +
        "<p><b>Please complete the upload " + REMINDER_DEADLINE + ":</b><br><a href=\"" + UPLOAD_LINK + "\">" + UPLOAD_LINK + "</a></p>" +
        "<ol><li>Open the link, enter your USN and tap <b>Next</b>.</li>" +
        "<li>Fill in your department, batch, HOD, coordinator and designation.</li>" +
        "<li>For each activity shown, add <b>at least 3 photos</b> and the <b>certificate</b> (image or PDF).</li>" +
        "<li>Tap <b>Submit</b> and keep the page open until it says <b>Submitted</b>.</li></ol>" +
        "<p>If you tried earlier and it did not go through, the page has been fixed. Open the link again in a new tab and submit once more. " +
        "Use Wi-Fi or a good mobile signal if you can.</p>" +
        "<p>If you see an error, reply to this email with a screenshot.</p>" +
        "<p>Thank you,<br>Team Connect4Society</p>"
    });
    sent[r.usn] = new Date().toISOString();
    count++;
  });
  PropertiesService.getScriptProperties().setProperty("REMINDED_" + REMINDER_ROUND, JSON.stringify(sent));
  Logger.log("Sent " + count + " reminder emails. Skipped " + skipped + " (already emailed or no valid email).");
}

function sentSet_() {
  const raw = PropertiesService.getScriptProperties().getProperty("REMINDED_" + REMINDER_ROUND);
  return raw ? JSON.parse(raw) : {};
}
function esc_(s) {
  return String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
}
