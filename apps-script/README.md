# Connect4Society backend (Google Apps Script)

`Code.gs` is the one backend for both pages:

| Page | What it does | Where it saves |
|---|---|---|
| `index.html` | On-spot registration at the NGO | Sheet1 of "connnect4society onspot data" |
| `upload.html` | Student enters USN, sees only their registered activities, uploads at least 3 photos and the certificate for each | Photos in Drive, one row per student in **Submissions**, one row per activity in **Submission Activities** |

## How it is set up

- The script lives in the Google Sheet **Connect4Society Registrations** (connect4society@gmail.com),
  under **Extensions → Apps Script**. Submissions and Submission Activities are tabs in that sheet,
  created automatically the first time a student uploads.
- On-spot registrations are read from **"connnect4society onspot data"** (owned by
  connect4society.info@gmail.com, shared with connect4society@gmail.com as Editor), tabs Sheet1–Sheet4.
  New registrations are added to Sheet1 in the same column layout. The tab list and column positions
  are `REG_BOOK_ID` and `REG_TABS` at the top of `Code.gs`. If that sheet is ever unshared from
  connect4society@gmail.com, the upload page stops finding students.
- Photos go to the Drive folder **Connect4Society Activity Uploads**, one subfolder per student
  and one per activity. It is created on the first upload.
- Both pages call the web app URL set as `BACKEND_URL` near the bottom of `index.html` and `upload.html`.

## Changing the code later

1. Open the sheet → **Extensions → Apps Script**, paste the new `Code.gs`, press Ctrl+S.
2. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.**
   Editing the existing deployment keeps the same URL, so the pages need no change.
   (Deploy → *New deployment* would create a different URL, and both pages would then need updating.)

## Test it

1. Open `index.html` and register a test student with 2 activities.
2. Open `upload.html`, enter that USN. Only those 2 activities should appear.
3. Add 3 photos and a certificate to each and submit. Check the new folder in Drive and the rows in
   **Submissions** and **Submission Activities**.
4. Delete the test rows and folder.

## Rules the backend enforces

- A USN must be registered before it can upload.
- Only the activities from that student's registration are accepted.
- 3 to 10 photos and the certificate for every activity; the college template is required only
  when the student picks "my college's own format".
- One submission per USN. To let a student redo it, delete their row in **Submissions**
  and their rows in **Submission Activities**.
