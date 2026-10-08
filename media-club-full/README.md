# MEDIA CLUB — site + backend

```
npm install
cp .env.example .env      # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed:admin        # creates/updates the admin account
npm start                 # http://localhost:3000   (admin panel: /admin)
npm test
```

- `public/index.html` is your site with one line added (`<script src="/shim.js">`). `public/shim.js` connects it to the API.
- Members: register with email + password on the Dashboard page, then fill in the Crew Profile.
- Uploads go to `data/uploads`. With `AUTO_APPROVE=false` they stay hidden until an admin approves them at `/admin`. OC and admin uploads go live instantly.
- Give someone the Organising Committee role (can publish events and journal posts) from `/admin` → Users.
- Back up the `data/` folder: it holds the database and every upload.
- Production: set `NODE_ENV=production`, a real `JWT_SECRET`, and serve over HTTPS.
