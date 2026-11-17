# Connect4Society backend (Google Apps Script)

`Code.gs` is the one backend for both pages:

| Page | What it does | Where it saves |
|---|---|---|
| `index.html` | On-spot registration at the NGO | **Registrations** sheet |
| `upload.html` | Student enters USN, sees only their registered activities, uploads at least 3 photos and the certificate for each | Photos in Drive, one row per student in **Submissions**, one row per activity in **Submission Activities** |

## Set it up (about 5 minutes)

1. Open the Apps Script project your registration page already uses (the one behind the
   `script.google.com/macros/s/AKfycbx9I2…/exec` link in `index.html`).
2. **Back up the old code first**: copy everything in `Code.gs` into a new file named `OldCode.gs.txt`
   on your computer.
3. Replace the contents of `Code.gs` with this repository's `apps-script/Code.gs`.
4. At the top of the file, check the settings:
   - `SPREADSHEET_ID`: leave `""` if the script was opened from the sheet (Extensions → Apps Script).
     Otherwise paste the ID of the sheet that holds registrations.
   - `REG_SHEET`: the tab name your registrations are stored in. If your existing tab has another
     name (for example `Sheet1`), put that name here. The script finds the columns by their headings,
     so it only needs a heading containing **USN** and one containing **Activities**.
     Activities in one cell must be separated by `|`, `;` or new lines.
   - `UPLOAD_FOLDER_ID`: the Drive folder for photos (the part after `/folders/` in the folder link).
     Leave `""` and the script makes "Connect4Society Activity Uploads" in My Drive.
5. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.**
   Editing the existing deployment keeps the same link, so both pages keep working without changes.
   Use **Execute as: Me** and **Who has access: Anyone**.
6. The first deploy asks for Drive and Sheets permission. Allow it.

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
