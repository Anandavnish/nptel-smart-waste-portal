# NPTEL Smart Waste Study Portal ♻️📚
> **Integrated Waste Management for a Smart City** — Curated Short Notes & High-Yield Audio Summaries

A fast, lightweight, and clean academic study portal designed specifically for students taking the NPTEL certification course *Integrated Waste Management for a Smart City*. Built with pure Vanilla HTML, CSS, and JavaScript with zero backend dependencies, ready for **1-click GitHub Pages hosting**.

---

## 🌟 Key Features

1. **4 Structured Revision Modules**:
   - **Module 1**: Week 01 to Week 03 (*Municipal Solid Waste Fundamentals & Characterization*)
   - **Module 2**: Week 04 to Week 06 (*Collection, Transfer, & Storage Systems*)
   - **Module 3**: Week 07 to Week 09 (*Biological & Thermal Processing Technologies*)
   - **Module 4**: Week 10 to Week 12 (*Sanitary Landfills, Circular Economy & Policies*)
2. **Clean Minimalist Academic Design**:
   - High contrast, modern typography (`Inter` & `JetBrains Mono`), crisp cards, and dark/light mode toggle.
3. **Animated "In Progress" Indicators**:
   - Real-time animated micro-spinners and shimmering progress bars for files currently being generated.
4. **Google Drive Integration**:
   - Smart URL parser automatically converts standard Google Drive share links into direct 1-click downloads and streaming links.
5. **Embedded Audio Player with Speed Controls**:
   - Listen to voice summaries directly in the browser with audio scrubbing, time tracking, and speed multipliers (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`).
6. **Student Study Progress Tracker**:
   - Checkboxes for students to mark modules as "Reviewed", automatically calculating and saving their completion progress in `localStorage`.
7. **Secure Admin Portal (GitHub API Direct Commit)**:
   - Dedicated Admin modal to update file links and switch statuses (`In Progress` ⏳ / `Ready` ✅) directly from the website without writing code or editing files manually.
   - Saves updates by committing directly to `data/content.json` in your GitHub repository using GitHub's REST API.

---

## 🚀 How to Host on GitHub Pages

1. **Create a GitHub Repository**:
   - Go to [GitHub](https://github.com/new) and create a repository (e.g., `nptel-waste-mgmt-notes`).
2. **Push your code**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: NPTEL Study Portal"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/nptel-waste-mgmt-notes.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Go to your repo on GitHub: **Settings** &rarr; **Pages**.
   - Under **Build and deployment** &rarr; **Branch**, select `main` and folder `/ (root)`.
   - Click **Save**.
   - Your website will be live in 1-2 minutes at:
     `https://YOUR_USERNAME.github.io/nptel-waste-mgmt-notes/`

---

## 🔒 How to Use the Admin Portal to Update Links

1. Open your published website (or local server).
2. Click the **Admin** button in the top right corner.
3. Enter your GitHub configuration:
   - **GitHub Username / Organization**: e.g., `anand`
   - **Repository Name**: e.g., `nptel-waste-mgmt-notes`
   - **Branch**: `main`
   - **GitHub Personal Access Token (PAT)**:
     - Generate a token at [GitHub Developer Settings &rarr; Personal access tokens](https://github.com/settings/tokens).
     - Give it `repo` scope (or fine-grained repository permissions for `Contents: Read and write`).
     - *Security note: Your token is stored only in your private browser's `localStorage` and is never committed or visible to public visitors.*
4. Update the modules:
   - Change Status from `⏳ In Progress` to `✅ Ready (Downloadable)`.
   - Paste your Google Drive link for the PDF or MP3.
5. Click **Save & Publish Changes**:
   - The portal commits the updated JSON file directly to GitHub!
   - Your website immediately displays the updated links and download buttons.

---

## 📁 Google Drive Sharing Instructions

When you upload your PDFs or MP3 audio files to Google Drive:
1. Right-click the file in Google Drive &rarr; click **Share** &rarr; **Share**.
2. Under *General Access*, change from *Restricted* to **"Anyone with the link"** (Role: *Viewer*).
3. Click **Copy link** (e.g., `https://drive.google.com/file/d/1A2B3C.../view?usp=sharing`).
4. Paste this exact link into the Admin Portal on the website. The website will automatically format it for both 1-click direct download and streaming!

---

## 💻 Local Preview & Testing

To preview the website locally on your computer:
- You can use any lightweight HTTP server, for example:
  ```bash
  npx -y serve .
  ```
  or with Python:
  ```bash
  python -m http.server 8000
  ```
- Then open `http://localhost:8000` or `http://localhost:3000` in your browser.
