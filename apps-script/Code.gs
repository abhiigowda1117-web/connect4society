/**
 * Connect4Society backend (Google Apps Script web app).
 *
 * One script serves both pages in this repository:
 *   index.html   on-spot registration      POST (no action)  -> Registrations sheet
 *   upload.html  activity photo upload     GET  ?action=lookup&usn=...
 *                                          POST {action:"start"}  -> creates Drive folders
 *                                          POST {action:"upload"} -> saves one file
 *                                          POST {action:"submit"} -> Submissions sheets
 *
 * Setup: see apps-script/README.md.
 */

// ---- Settings -------------------------------------------------------------

// Spreadsheet that holds every sheet below. Leave "" if this script is bound
// to the spreadsheet (opened from Extensions > Apps Script in that sheet).
const SPREADSHEET_ID = "";

// Drive folder that receives every student's photos. Paste the folder ID
// (the part after /folders/ in its link). Leave "" to create
// "Connect4Society Activity Uploads" in My Drive on first use.
const UPLOAD_FOLDER_ID = "";

const REG_SHEET = "Registrations";             // on-spot registrations
const SUB_SHEET = "Submissions";               // one row per student
const ACT_SHEET = "Submission Activities";     // one row per student per activity

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;       // per file, after the page compresses photos
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
                       "application/pdf",
                       "application/msword",
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

const REG_HEADERS = ["Timestamp", "Name", "USN", "College", "Email", "Phone", "Points", "Activities"];
const SUB_HEADERS = ["Timestamp", "USN", "Name", "College", "Department", "Batch",
                     "AICTE coordinator", "Coordinator designation", "HOD",
                     "Report format", "College template", "Format notes",
                     "Activities", "Total photos", "Student folder"];
const ACT_HEADERS = ["Timestamp", "USN", "Name", "College", "Activity",
                     "Photo count", "Photo links", "Certificate", "Activity folder"];

// ---- Entry points ---------------------------------------------------------

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === "lookup") return json_(lookup_(p.usn));
    return json_({success: true, message: "Connect4Society backend is running."});
  } catch (err) {
    return json_({success: false, message: String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    switch (data.action) {
      case "start":  return json_(start_(data));
      case "upload": return json_(upload_(data));
      case "submit": return json_(submit_(data));
      case undefined:
      case "":
      case "register": return json_(register_(data));
      default: return json_({success: false, message: "Unknown action."});
    }
  } catch (err) {
    return json_({success: false, message: String(err && err.message || err)});
  }
}

// ---- Registration (index.html) --------------------------------------------

function register_(d) {
  const name = clean_(d.name, 100), usn = normUsn_(d.usn), college = clean_(d.college, 150);
  const email = clean_(d.email, 150).toLowerCase(), phone = clean_(d.contact, 15);
  const points = Number(d.points);
  const acts = (Array.isArray(d.activities) ? d.activities : []).map(a => clean_(a, 150)).filter(String);

  if (!name || !usn || !college || !email) return fail_("Please fill in every required field.");
  if (!/^\d{10}$/.test(phone)) return fail_("Enter a 10-digit phone number.");
  if ([20, 40, 60, 80, 100].indexOf(points) < 0) return fail_("Choose the points you need.");
  if (acts.length !== points / 20) return fail_("Choose exactly " + points / 20 + " activities.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(REG_SHEET, REG_HEADERS);
    const regs = readRegistrations_(sh);
    if (regs.some(r => r.usn === usn)) return fail_("This USN is already registered. Contact the organiser if your details need to change.");
    if (regs.some(r => r.email && r.email === email)) return fail_("This email is already registered with another USN.");
    sh.appendRow([new Date(), name, usn, college, email, "'" + phone, points, acts.join(" | ")]);
  } finally {
    lock.releaseLock();
  }
  return {success: true, message: "Registration submitted."};
}

// ---- Photo upload (upload.html) -------------------------------------------

/** Returns the student's name, college and registered activities. No email or phone. */
function lookup_(rawUsn) {
  const usn = normUsn_(rawUsn);
  if (!usn) return fail_("Enter your USN.");
  const reg = findRegistration_(usn);
  if (!reg) return fail_("No on-spot registration found for " + usn + ". Check the USN, or ask the organiser to register you.");
  const done = findSubmission_(usn);
  return {
    success: true,
    student: {usn: usn, name: reg.name, college: reg.college, activities: reg.activities},
    submitted: done ? Utilities.formatDate(done, Session.getScriptTimeZone(), "d MMM yyyy, h:mm a") : "",
    minPhotos: MIN_PHOTOS, maxPhotos: MAX_PHOTOS
  };
}

/** Creates the student's Drive folders and returns an upload token valid for 6 hours. */
function start_(d) {
  const usn = normUsn_(d.usn);
  const reg = usn && findRegistration_(usn);
  if (!reg) return fail_("No on-spot registration found for this USN.");
  if (findSubmission_(usn)) return fail_("Photos for this USN were already submitted. Contact the organiser to change them.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let state;
  try {
    const root = uploadRoot_();
    const student = child_(root, usn + " - " + reg.name);
    const folders = {};
    reg.activities.forEach((a, i) => folders["a" + i] = child_(student, a).getId());
    folders.template = child_(student, "College report template").getId();
    state = {usn: usn, student: student.getId(), folders: folders};
  } finally {
    lock.releaseLock();
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("up_" + token, JSON.stringify(state), 21600);
  return {success: true, token: token};
}

/** Saves one file. The page sends files one at a time, several in parallel. */
function upload_(d) {
  const state = state_(d.token);
  if (!state) return fail_("Upload session expired. Reload the page and try again.");
  const folderId = state.folders[d.slot];
  if (!folderId) return fail_("Unknown activity.");
  const type = String(d.type || "");
  if (ALLOWED_TYPES.indexOf(type) < 0) return fail_("That file type is not accepted: " + type);

  const bytes = Utilities.base64Decode(String(d.data || ""));
  if (!bytes.length) return fail_("The file was empty.");
  if (bytes.length > MAX_FILE_BYTES) return fail_("File is larger than " + MAX_FILE_BYTES / 1048576 + " MB.");

  const name = clean_(d.name, 120).replace(/[\\/]/g, "_") || "file";
  const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, type, name));
  return {success: true, id: file.getId()};
}

/** Records the finished submission once every file is uploaded. */
function submit_(d) {
  const state = state_(d.token);
  if (!state) return fail_("Upload session expired. Reload the page and try again.");
  const usn = state.usn;
  const reg = findRegistration_(usn);
  if (!reg) return fail_("Registration not found.");

  const f = d.details || {};
  const details = {
    dept: clean_(f.dept, 120), batch: clean_(f.batch, 20), coord: clean_(f.coord, 100),
    desig: clean_(f.desig, 80), hod: clean_(f.hod, 100),
    format: f.format === "college" ? "College's own format" : "Standard Connect4Society format",
    notes: clean_(f.notes, 1000)
  };
  if (!details.dept || !/^\d{4}-\d{4}$/.test(details.batch) || !details.coord || !details.desig || !details.hod)
    return fail_("Some student details are missing.");

  const files = d.files || {};
  const link = id => "https://drive.google.com/open?id=" + id;
  const rows = [];
  let total = 0;
  for (let i = 0; i < reg.activities.length; i++) {
    const got = files["a" + i] || {};
    const photos = (got.photos || []).map(String).filter(Boolean);
    if (photos.length < MIN_PHOTOS) return fail_(reg.activities[i] + " needs at least " + MIN_PHOTOS + " photos.");
    if (photos.length > MAX_PHOTOS) return fail_(reg.activities[i] + " has more than " + MAX_PHOTOS + " photos.");
    total += photos.length;
    rows.push({activity: reg.activities[i], photos: photos.map(link),
               cert: got.cert ? link(String(got.cert)) : "", folder: link(state.folders["a" + i])});
  }
  const template = (files.template && files.template.length) ? files.template.map(link).join(", ") : "";
  if (f.format === "college" && !template) return fail_("Upload your college's report template.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (findSubmission_(usn)) return fail_("Photos for this USN were already submitted.");
    const now = new Date();
    sheet_(SUB_SHEET, SUB_HEADERS).appendRow([now, usn, reg.name, reg.college, details.dept, details.batch,
      details.coord, details.desig, details.hod, details.format, template, details.notes,
      reg.activities.join(" | "), total, link(state.student)]);
    const act = sheet_(ACT_SHEET, ACT_HEADERS);
    rows.forEach(r => act.appendRow([now, usn, reg.name, reg.college, r.activity,
      r.photos.length, r.photos.join(", "), r.cert, r.folder]));
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove("up_" + d.token);
  return {success: true, photos: total};
}

// ---- Helpers --------------------------------------------------------------

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(message) { return {success: false, message: message}; }
function clean_(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function normUsn_(v) { return clean_(v, 30).toUpperCase().replace(/\s+/g, ""); }

function book_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(name, headers) {
  const ss = book_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}

/** Reads registrations, finding columns by header so an existing sheet also works. */
function readRegistrations_(sh) {
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const h = values[0].map(x => x.toLowerCase());
  const col = re => h.findIndex(x => re.test(x));
  const cUsn = col(/usn/), cName = col(/name/), cCollege = col(/college|institution/),
        cEmail = col(/mail/), cActs = col(/activit/);
  if (cUsn < 0 || cActs < 0) throw new Error("The " + REG_SHEET + " sheet needs a USN column and an Activities column.");
  return values.slice(1).map(r => ({
    usn: normUsn_(r[cUsn]),
    name: cName >= 0 ? r[cName].trim() : "",
    college: cCollege >= 0 ? r[cCollege].trim() : "",
    email: cEmail >= 0 ? r[cEmail].trim().toLowerCase() : "",
    activities: String(r[cActs]).split(/\s*(?:\||\n|;)\s*/).map(s => s.trim()).filter(Boolean)
  })).filter(r => r.usn);
}
function findRegistration_(usn) {
  const sh = book_().getSheetByName(REG_SHEET);
  if (!sh) return null;
  const matches = readRegistrations_(sh).filter(r => r.usn === usn);
  return matches.length ? matches[matches.length - 1] : null;
}
/** Returns the submission date for this USN, or null. */
function findSubmission_(usn) {
  const sh = book_().getSheetByName(SUB_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (let i = rows.length - 1; i >= 0; i--) if (normUsn_(rows[i][1]) === usn) return rows[i][0];
  return null;
}
function state_(token) {
  const raw = token && CacheService.getScriptCache().get("up_" + token);
  return raw ? JSON.parse(raw) : null;
}
function uploadRoot_() {
  if (UPLOAD_FOLDER_ID) return DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("UPLOAD_ROOT");
  if (saved) { try { return DriveApp.getFolderById(saved); } catch (e) {} }
  const folder = DriveApp.createFolder("Connect4Society Activity Uploads");
  props.setProperty("UPLOAD_ROOT", folder.getId());
  return folder;
}
function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
