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
