# Creative Resizer — Setup Guide

This app uploads an image, then uses Google Vertex AI to intelligently resize it to different aspect ratios by extending the background — never aggressively cropping.

---

## What You'll Need

- [Node.js](https://nodejs.org) (version 18 or later)
- A Google Cloud account (free tier works for testing)
- A credit card on file with Google Cloud (Vertex AI requires billing to be enabled, but you won't be charged much for small usage)

---

## Step-by-Step Setup

### Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version and run the installer
3. To confirm it worked, open Terminal (Mac) or Command Prompt (Windows) and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0`

---

### Step 2 — Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown in the top-left (it may say "Select a project")
3. Click **New Project**
4. Give it a name like `creative-resizer` and click **Create**
5. **Copy the Project ID** — it looks like `creative-resizer-123456`
   - You'll paste this into your `.env` file later

---

### Step 3 — Enable the Vertex AI API

1. In Google Cloud Console, make sure your new project is selected
2. Go to: **APIs & Services → Library**
   - Or visit: https://console.cloud.google.com/apis/library
3. Search for **Vertex AI API**
4. Click it and press **Enable**

---

### Step 4 — Enable Billing

Vertex AI requires billing to be enabled (you won't be charged for small usage, and Google offers free credits for new accounts).

1. Go to: https://console.cloud.google.com/billing
2. Link a billing account to your project
3. New Google Cloud accounts get $300 in free credits

---

### Step 5 — Create a Service Account Key

This gives the app permission to call Vertex AI on your behalf.

1. Go to: **IAM & Admin → Service Accounts**
   - Or visit: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **+ Create Service Account**
3. Name it `creative-resizer-sa` and click **Create and Continue**
4. Under **Grant this service account access to project**, choose the role:
   - **Vertex AI User**
5. Click **Done**
6. Click the service account you just created
7. Go to the **Keys** tab → **Add Key → Create new key → JSON**
8. A `.json` file will download — **move it into this project folder** and rename it:
   ```
   service-account-key.json
   ```
   > ⚠️ Never commit this file to Git. It's already in .gitignore.

---

### Step 6 — Configure Your .env File

1. In the project folder, copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in any text editor
3. Replace `your-project-id-here` with the Project ID you copied in Step 2
4. Save the file

Your `.env` should look like:
```
GCP_PROJECT_ID=creative-resizer-123456
GCP_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
PORT=3000
```

---

### Step 7 — Install Dependencies and Run

Open Terminal, navigate to this folder, then run:

```bash
# Install all required packages (only needed once)
npm install

# Start the server
node server.js
```

You should see:
```
Creative Resizer running at http://localhost:3000
```

Open your browser and go to: **http://localhost:3000**

---

## Using the App

1. Click **Upload Image** and choose a photo
2. Check the aspect ratios you want (e.g. 1:1 and 9:16)
3. Optionally add brand instructions (e.g. "white background, keep logo sharp")
4. Click **Resize with AI**
5. Wait 20–60 seconds — Vertex AI is generating the extended backgrounds
6. Resized images appear on screen with download links
7. Files are also saved in the `/outputs` folder

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'express'` | Run `npm install` again |
| `Error 403 from Vertex AI` | Check your service account has the **Vertex AI User** role |
| `Error 400 from Vertex AI` | Make sure billing is enabled on your project |
| `GOOGLE_APPLICATION_CREDENTIALS not set` | Check your `.env` file has the correct path to the JSON key |
| Port 3000 already in use | Change `PORT=3001` in your `.env` |

---

## Project Structure

```
creative-resizer/
├── server.js                  ← Backend: Express + Vertex AI calls
├── public/
│   ├── index.html             ← The web page
│   └── app.js                 ← Frontend JavaScript
├── outputs/                   ← Generated images are saved here
├── service-account-key.json   ← Your GCP key (never share this)
├── .env                       ← Your local config (never share this)
├── .env.example               ← Template for the above
└── README.md                  ← This file
```
