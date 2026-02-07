# Scale Rebel Studio — Static + Netlify (Client-Owned)

## Quick start (Netlify)
1. Create a new site in Netlify and deploy this folder/zip (publish: `.`).
2. Set environment variables:
   - `RESEND_API_KEY`
   - `CONTACT_EMAIL`
   - `FROM_EMAIL` (optional; default is set)
3. Test the form on `/contact.html`.

## Editing content
- Projects list: `data/projects.json`
- Header/Nav: `partials/header.html`
- Footer: `partials/footer.html`
- Styling: `styles.css`

## Notes
- The background visuals are CSS-generated (no heavy images).
- Contact form posts to `/.netlify/functions/send-email` via `/api/send-email`.
