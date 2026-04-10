# Deploying Nauti Sonar to sonar.nautilusmarketing.digital

This guide walks you through deploying the app on your Plesk server using Git auto-deploy.


## What You Need

- Plesk panel access
- MariaDB/MySQL available on the server
- Node.js 20+ enabled in Plesk
- GitHub repo: `https://github.com/BruceWayneS-GIT/nauti-sonar.git`


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


## Step 3 — Create the Database

1. In Plesk, go to **Databases** → **Add Database**
2. Set the type to **MySQL** (MariaDB)
3. Database name: `nauti_sonar`
4. Create a database user and note the username and password


## Step 4 — Add Environment Variables

Since the `.env` file is not included in the Git repo (for security), you need to add the variables in Plesk.

1. Go to the subdomain → **Node.js**
2. Scroll to **Application Environment Variables**
3. Add these three variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `mysql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:3306/nauti_sonar` |
| `AUTH_SECRET` | Pick a long random string (at least 32 characters) |
| `AUTH_USERS` | `admin:NautiSonar2024!,Bruce:Bruce2026!` |

Replace `YOUR_DB_USER` and `YOUR_DB_PASSWORD` with the credentials from Step 3.


## Step 5 — Set Up Git Deployment

1. Go to the `sonar.nautilusmarketing.digital` subdomain
2. Click **Git**
3. Select **Remote** repository
4. Enter the repository URL:
   ```
   https://github.com/BruceWayneS-GIT/nauti-sonar.git
   ```
5. Click OK to pull the repo

### Enable Auto-Build on Deploy

1. In the Git panel, click **Repository Settings**
2. Check **Enable additional deploy actions**
3. In the command box, paste:
   ```
   npm install && npx prisma generate && npx prisma db push && npm run build
   ```
4. Click OK

### Set Up Auto-Deploy from GitHub

This makes it so every `git push` automatically deploys to the server.

1. In the Plesk Git panel, copy the **Webhook URL**
2. Go to your GitHub repo → **Settings** → **Webhooks** → **Add webhook**
3. Fill in:
   - **Payload URL**: Paste the webhook URL from Plesk
   - **Content type**: `application/json`
   - **Which events**: Just the push event
4. Click **Add webhook**


## Step 6 — Initial Deploy

1. In the Plesk Git panel, click **Deploy**
2. Wait for it to pull the code, install dependencies, and build (this takes a few minutes the first time)
3. Once done, go to the **Node.js** panel and click **Restart App**


## Step 7 — Set Up SSL (if needed)

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

To add more users, update the `AUTH_USERS` environment variable in Plesk's Node.js panel:

```
admin:NautiSonar2024!,Bruce:Bruce2026!,NewUser:NewPassword123!
```

Then restart the app.


## Pushing Updates

After the initial setup, deploying changes is simple:

```bash
# On your Mac, make your changes then:
git add -A
git commit -m "Description of changes"
git push
```

That's it. Plesk will automatically:
1. Pull the latest code
2. Run `npm install`
3. Generate the Prisma client
4. Update the database schema if needed
5. Build the app

The app restarts automatically after the build completes.


## Troubleshooting

**Deploy action fails?**
- SSH into the server and check the Node.js version: `node -v`
- Make sure it's 20 or higher
- Try running the deploy commands manually from the document root

**App won't start?**
- Check the Node.js error log in Plesk
- Make sure environment variables are set correctly
- Make sure the build completed successfully

**Database connection error?**
- Verify the `DATABASE_URL` environment variable in Plesk
- Make sure MariaDB/MySQL is running
- Check that the database `nauti_sonar` exists

**Webhook not triggering?**
- Check GitHub → Settings → Webhooks → Recent Deliveries for errors
- If Plesk uses a self-signed SSL certificate, try using `http://` instead of `https://` for the webhook URL

**Login not working?**
- Check the `AUTH_USERS` environment variable format: `user:pass,user:pass`
- Restart the app after changing environment variables
