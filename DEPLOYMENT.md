# Deploying Nauti Sonar to sonar.nautilusmarketing.digital

This guide walks you through deploying the app on your Plesk server step by step.


## What You Need

- Plesk panel access
- PostgreSQL available on the server
- Node.js 20+ enabled in Plesk


## Step 1 — Create the Subdomain

1. Log into Plesk
2. Go to **Websites & Domains**
3. Click **Add Subdomain**
4. Enter: `sonar.nautilusmarketing.digital`
5. Click OK


## Step 2 — Enable Node.js

1. Click on the `sonar.nautilusmarketing.digital` subdomain
2. Find **Node.js** under Dev Tools and click it
3. Set these values:
   - **Node.js version**: 20 or higher
   - **Application Root**: `/sonar.nautilusmarketing.digital`
   - **Application Startup File**: `node_modules/next/dist/bin/next`
   - **Application Mode**: `production`
4. Click **Enable Node.js**


## Step 3 — Upload the Files

A zip file is ready on your Desktop: `nauti-sonar.zip`

1. In Plesk, go to **File Manager** for the subdomain
2. Upload `nauti-sonar.zip` into the document root folder
3. Click **Extract** on the zip file
4. Delete the zip file after extracting


## Step 4 — Create the Database

1. In Plesk, go to **Databases** → **Add Database**
2. Set the type to **PostgreSQL**
3. Database name: `nauti_sonar`
4. Create a database user (remember the username and password)


## Step 5 — Create the .env File

1. In **File Manager**, navigate to the document root
2. Create a new file called `.env`
3. Paste the following and fill in your database details:

```
DATABASE_URL="postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/nauti_sonar?schema=public"
AUTH_SECRET="pick-a-long-random-string-at-least-32-characters"
AUTH_USERS="admin:NautiSonar2024!,Bruce:Bruce2026!"
```

Replace `YOUR_DB_USER` and `YOUR_DB_PASSWORD` with the credentials from Step 4.


## Step 6 — Install and Build

Open the SSH terminal in Plesk (or SSH into the server) and run these commands from the document root:

```bash
npm install
npx prisma generate
npx prisma db push
npm run build
```

This will take a few minutes.


## Step 7 — Start the App

Go back to the **Node.js** panel for the subdomain and click **Restart App**.


## Step 8 — Set Up SSL (if needed)

1. Go to the subdomain → **SSL/TLS Certificates**
2. Click **Install** under Let's Encrypt
3. Check the box for `sonar.nautilusmarketing.digital`
4. Click Install

Your app is now live at **https://sonar.nautilusmarketing.digital**


## Login Accounts

| Username | Password         |
|----------|------------------|
| admin    | NautiSonar2024!  |
| Bruce    | Bruce2026!       |

To add more users later, edit the `AUTH_USERS` line in `.env`:

```
AUTH_USERS="admin:NautiSonar2024!,Bruce:Bruce2026!,NewUser:NewPassword123!"
```

Then restart the app in the Node.js panel.


## Updating the App Later

When you make changes locally:

1. Run `npm run build` locally to check it works
2. Zip the updated files (same as before, excluding `node_modules`, `.next`, `.env`)
3. Upload and extract to the server
4. SSH in and run:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   npm run build
   ```
5. Restart the app in Plesk


## Troubleshooting

**App won't start?**
- Check the Node.js error log in Plesk
- Make sure `.env` exists and has the correct database URL
- Make sure you ran `npm run build`

**Database connection error?**
- Verify the database credentials in `.env`
- Make sure PostgreSQL is running on the server
- Check that the database `nauti_sonar` exists

**Login not working?**
- Check the `AUTH_USERS` line in `.env` — format must be `user:pass,user:pass`
- Restart the app after changing `.env`
