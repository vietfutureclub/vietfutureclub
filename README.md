# ES Trading Plans for Vercel

This project auto-builds an `index.html` that:

- opens the newest plan first
- groups the dropdown by **date**
- shows each file as a **version/update** under that date
- lets users open any plan in a new tab

## Folder structure

- `plans/` → put all your raw `.html` plan files here
- `scripts/generate-index.mjs` → scans `plans/`, copies files to `dist/plans/`, and builds `dist/index.html`
- `vercel.json` → tells Vercel to serve the `dist` folder
- `dist/` → generated output that Vercel will serve

## Local build

```bash
npm run build
```

## Recommended deployment: GitHub + Vercel

1. Create a GitHub account.
2. Create a new repository.
3. Upload the contents of this folder into the repository.
4. In Vercel, click **Add New Project**.
5. Import the GitHub repository.
6. Vercel should detect `package.json`.
7. Build command: `npm run build`
8. Output directory: `dist`
9. Click **Deploy**.

After that, every time you add a new HTML file into `plans/` and push to GitHub, Vercel rebuilds automatically and updates the homepage.

## Manual dashboard-only workflow

Important limitation:

- **Vercel Drop does not update an existing project by drag-and-drop.**
- Each drop creates a **new** project.

So if you want to stay dashboard-only, the safe manual process is:

1. Add your new HTML file into `plans/` locally.
2. Run `npm run build` locally.
3. Upload/deploy the whole updated project again.

That works for one-off uploads, but it is not as convenient as GitHub.

## Notes

- If you only upload a new HTML file without rebuilding, `index.html` will not know about it.
- The homepage is generated automatically during each build.
