# 🌳 Genealogy Tree Checker

A beautiful web application to review and manage your family tree. Add family members, track relationships, and organize your genealogy all in one place.

## ✨ Features

- ✅ **Add Family Members** - Record names, relationships, and birth years
- ✅ **Beautiful UI** - Modern gradient design with smooth animations
- ✅ **Family Tree Display** - Organized view of all family members
- ✅ **Persistent Storage** - Data saved automatically to browser storage
- ✅ **Relationship Types** - Support for Parents, Siblings, Children, Grandparents, Grandchildren, Spouses, Cousins, Aunts/Uncles, Nieces/Nephews
- ✅ **Responsive Design** - Works perfectly on mobile, tablet, and desktop
- ✅ **Easy to Use** - Intuitive interface with one-click member removal

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/marrerocucha10-art/Genealogy-tree-checker.git
   cd Genealogy-tree-checker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   - Visit: **http://localhost:3000**
   - Start adding your family members!

## 📁 Project Structure

```
Genealogy-tree-checker/
├── server.js              # Express server
├── package.json           # Node dependencies
├── .gitignore            # Git ignore file
├── README.md             # This file
└── public/
    ├── index.html        # Main HTML page
    ├── styles.css        # CSS styling
    └── script.js         # Frontend JavaScript
```

## 🎨 How to Use

### Adding a Family Member
1. Fill in the form with:
   - **Name** - The person's full name
   - **Relation** - Choose from the dropdown list
   - **Birth Year** - Optional birth year

2. Click **"Add Member"** button

3. Your family member appears in the Family Tree section

### Removing a Family Member
1. Click the **"Remove"** button on any family member card
2. Confirm the removal when prompted
3. The member is deleted from your tree

### Viewing Your Family Tree
- All added members display in organized cards
- Each card shows:
  - Name
  - Relationship type (in a badge)
  - Birth year
  - Remove button

## GEDCOM Parser API

Bubble can send GEDCOM text to the Vercel app and receive structured JSON.

```http
POST /api/parse
Content-Type: application/json

{
  "gedcom": "0 @I1@ INDI\n1 NAME Jane /Doe/\n1 BIRT\n2 DATE 1 JAN 1900"
}
```

The same parser is also available at `POST /api/parse-gedcom`. It accepts raw text or JSON fields named `gedcom`, `text`, or `file`.

Bubble file uploads can be sent directly by URL:

```http
POST /api/parse-url
Content-Type: application/json

{
  "url": "https://example.com/uploaded-family-tree.ged"
}
```

The same URL parser is also available at `POST /api/parse-gedcom-url`. It accepts JSON fields named `url`, `fileUrl`, or `gedcomUrl`, downloads up to 10 MB, then returns the same structured JSON response.

## 💾 Data Storage

Your family tree data is automatically saved to your browser's **LocalStorage**. This means:
- Your data persists between sessions
- Your data is stored locally on your device
- No server-side database required for personal use

## 🎞️ Photo-to-Life Setup

The Photo-to-Life page creates a short AI-generated motion keepsake from a customer-authorized family portrait. To enable it, add these environment variables to the deployment:

```text
REPLICATE_API_TOKEN=your_replicate_token
REPLICATE_MODEL=kwaivgi/kling-v2.1
```

Customers must confirm that they have permission to use the photo and acknowledge that the result is AI-generated, not an original historical recording. The app accepts JPG, PNG, and WebP portraits up to 10 MB and requests a five-second, subtle animation.

## 🔐 Administration Review

Administration review lets an administrator walk the full subscription flow without
being charged. Add `?admin_review=true` to a page — for example
`/store.html?admin_review=true#subscriptions` — and every plan renders a
"Review {Plan} at No Charge" button instead of a real checkout button.

Access is open by default: with no passphrase configured, the link just works,
including on a static deploy with no API. That is deliberate. Administration
review only reveals the no-charge buttons — paid tiers are read from
`localStorage` and can be edited by anyone with browser devtools, so locking this
page down protects very little. It is a convenience, not a revenue control.

To require a passphrase anyway, set the variables below. The gate then sends you
to `/admin.html` first, and a correct passphrase sets an HttpOnly, HMAC-signed,
two-hour cookie that page scripts can neither read nor forge. Failed attempts are
rate limited.

```text
ADMIN_REVIEW_PASSPHRASE_HASH=sha256_hex_of_the_normalized_passphrase
ADMIN_REVIEW_SESSION_SECRET=long_random_string
```

Set `ADMIN_REVIEW_SESSION_SECRET` in any environment that runs more than one
instance. Sessions are stateless — the cookie carries its own expiry and signature,
so any instance holding the secret can verify it — but if the secret is left unset
each process invents a random one at boot and sessions stop working across
instances. Changing the secret signs everyone out, which is how you revoke access.

Prefer `ADMIN_REVIEW_PASSPHRASE_HASH` so the passphrase itself is never stored.
Passphrases are compared in a normalized form (lowercased, with every
non-alphanumeric character removed) so that capitalisation, hyphens, spaces and
stray invisible characters from a copy-paste don't cause a confusing rejection.
Generate the hash from that same normalized form:

```bash
node -e "const c=require('crypto');const n=process.argv[1].toLowerCase().replace(/[^a-z0-9]/g,'');console.log(c.createHash('sha256').update(n).digest('hex'))" 'your passphrase'
```

`ADMIN_REVIEW_PASSPHRASE` accepts a plaintext passphrase instead, which is
convenient for local development. Leave both unset to keep administration review
open.

## 🛡️ Security Features

- XSS protection to prevent script injection
- Safe HTML escaping for all user inputs
- Client-side data validation

## 🌐 Deployment

This app can be easily deployed to popular platforms:

### Heroku
```bash
heroku create your-app-name
git push heroku main
heroku open
```

### Vercel
```bash
npm install -g vercel
vercel
```

### GitHub Pages
The GitHub Pages workflow publishes the standalone client app from `public/`. The
GEDCOM importer runs in the browser, so it works on Pages without the Express API.

### Render
1. Connect your GitHub repository
2. Set start command: `npm start`
3. Deploy!

## 🛍️ Physical Product Launch

The app can create a flattened, print-ready 18x24 portrait family-tree poster as a PNG. To launch the first physical product without maintaining a Shopify storefront:

1. Create the 18x24 portrait poster product in Printify's Free plan.
2. In the app, open a completed family tree and select **Download 18x24 Poster PNG** from **Celebrate Your Updated Tree**.
3. Upload the PNG to the matching Printify product and create its mockups.
4. Add the product to Big Cartel, connect Big Cartel to your existing Stripe account, and test a real checkout.
5. Fulfill the first orders manually in Printify until your sales volume makes further storefront automation worthwhile.

Price each physical item only after confirming its Printify base cost, shipping, applicable tax, Stripe fees, and your intended profit margin. Do not cancel a prior storefront until a Big Cartel checkout and fulfillment test succeeds.

## 📝 License

ISC License - Feel free to use and modify!

## 👤 Author

**marrerocucha10-art** - Created 2026

---

## 🤝 Contributing

Feel free to fork this project and submit pull requests for any improvements!

## 💡 Ideas for Future Enhancements

- Export family tree to PDF
- Photo uploads for family members
- Family events timeline
- Database integration for shared family trees
- Mobile app version
- Tree visualization with connecting lines
- Search and filter functionality

---

**Happy genealogy tracking! 🌳**
