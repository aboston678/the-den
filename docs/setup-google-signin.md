# Setting up Google sign-in (about 15–20 minutes)

Do these whenever it suits you. One click per step. If a screen looks different from what's written, stop and tell Claude what you see.
At the end you'll send Claude **two things** (both are safe to share): the **Project URL** and the **anon public key**.

---

## Part A: Make the Supabase project (accounts + database)

1. Open **https://supabase.com** and click **Start your project**.
2. Click **Continue with GitHub** and sign in with your GitHub account (the one that has the-den).
3. If it asks you to create an organization: name it **The Den**, plan **Free**, click **Create organization**.
4. Click **New project**.
5. Project name: **the-den**.
6. Database password: click **Generate a password**, then click the copy icon and paste it into your password manager or Notes. (Claude doesn't need it.)
7. Region: pick **East US (North Virginia)** (closest to the game server).
8. Click **Create new project** and wait about a minute until the dashboard appears.
9. In the left sidebar, click the **gear icon (Project Settings)**, then **Data API** (or **API**).
10. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`) into Notes, labelled "Project URL".
11. Click **API Keys** in the same settings menu. Copy the **anon / public** key into Notes, labelled "anon key".
12. On the same page, find the **service_role / secret** key. **Don't send this one to anyone, including Claude.** You'll paste it into Railway in Part D.
13. Keep this browser tab open.

## Part B: Make the Google login button (Google Cloud)

14. In a new tab, open **https://console.cloud.google.com** and sign in with your Google account.
15. If asked, tick the terms box and click **Agree and continue**.
16. At the top left, click the **project picker** (it may say "Select a project"), then **New project**.
17. Project name: **The Den**. Click **Create**, then wait and make sure "The Den" is selected in the project picker.
18. In the search bar at the top, type **Google Auth Platform** (or **OAuth consent screen**) and open it.
19. Click **Get started**.
20. App name: **The Den**. User support email: pick your email. Click **Next**.
21. Audience: choose **External**. Click **Next**.
22. Contact email: your email. Click **Next**, tick the agreement box, click **Continue**, then **Create**.
23. In the left menu, click **Audience**, then click **Publish app**, then **Confirm**. (This lets your friends sign in without you adding each one by hand. The game only asks Google for name and email, so Google doesn't need to review it.)
24. In the left menu, click **Clients**, then **+ Create client**.
25. Application type: **Web application**. Name: **The Den**.
26. Under **Authorized redirect URIs**, click **+ Add URI** and type your Project URL from step 10 with `/auth/v1/callback` on the end, e.g. `https://abcd1234.supabase.co/auth/v1/callback`.
27. Click **Create**.
28. A box shows a **Client ID** and **Client secret**. Copy both into Notes. (These go into Supabase in the next part. Claude doesn't need them.)

## Part C: Connect Google to Supabase

29. Back in the Supabase tab, click **Authentication** in the left sidebar (the person icon).
30. Click **Sign In / Providers** (or **Providers**), then click **Google**.
31. Turn on **Enable Sign in with Google**.
32. Paste the **Client ID** from step 28 into **Client IDs**.
33. Paste the **Client secret** from step 28 into **Client Secret (for OAuth)**.
34. Click **Save**.
35. Still in Authentication, click **URL Configuration**.
36. **Site URL**: replace what's there with `https://the-den-pwg7.vercel.app` and click **Save**.
37. Under **Redirect URLs**, click **Add URL** and add `http://localhost:5173/**`, then click **Save URLs**.
38. Click **Add URL** again, add `https://the-den-pwg7.vercel.app/**`, and save.
39. Click **Add URL** again, add `https://the-den-*.vercel.app/**` (for test versions of the site), and save.

## Part D: Give the keys to the website and the game server

40. Open **https://railway.com**, open the **the-den** project, then click the game server box.
41. Click the **Variables** tab, then **+ New Variable**.
42. Name: `SUPABASE_URL`. Value: your Project URL. Click **Add**.
43. Click **+ New Variable** again. Name: `SUPABASE_SERVICE_ROLE_KEY`. Value: the **service_role** key from step 12. Click **Add**.
44. Click **Deploy** (or **Apply changes**) if Railway shows that button.
45. Open **https://vercel.com**, open the **the-den-pwg7** project, click **Settings**, then **Environment Variables**.
46. Key: `VITE_SUPABASE_URL`. Value: your Project URL. Leave all environments ticked. Click **Save**.
47. Key: `VITE_SUPABASE_ANON_KEY`. Value: the **anon** key from step 11. Click **Save**.

## Part E: Send Claude two things

48. Paste into the chat: the **Project URL** and the **anon public key**. (Both are public by design; they go in the website anyway.)

Done. Claude will set up the tables, the private video storage and the sign-in screen, and tell you if anything else needs a click.
