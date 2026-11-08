# Cine Space: interface decisions

Short answers for "why did you design it this way?". The colour scheme is unchanged: purple accent `#7c3aed`, light and dark themes, Plus Jakarta Sans.

## What was simplified, and the principle behind it

| Change | Principle |
|---|---|
| One top bar replaces the side rail, greeting, theme button and separate menus: two places to go (Discover, My library), search, one primary action (Add TV show), account menu | **Hick's law**: fewer choices at once, faster decisions. **Consistency**: same bar on every page |
| Discover is one calm column: Today's pick, Continue watching, then rows. The auto-rotating carousel and side cards are gone | Nothing moves unless the user asks (WCAG 2.2.2). One focal point per screen |
| Library filters: search, type, sort and Favorites are visible; genre, franchise, mood, tag, years and the A-Z index sit behind one **Filters** button that shows how many are active and opens itself when any are on | **Progressive disclosure**: common tasks first, power features one click away. **Visibility of status**: filters are never active out of sight |
| Statistics cards became one sentence under the title | Less noise, same information |
| Cards: poster on top, title and facts below, never text over the picture | **Legibility**: contrast never depends on the poster |
| Title page: one header, one tracking column (status and progress together), tags and review below | **Proximity**: related controls sit together. One job per panel |
| Login: one centred card, no decorative art | Focus on the task |
| Surprise me sits on Discover and My library, not in a global bar | Actions appear where they make sense |

## Rules applied everywhere
- **Colour**: text and controls meet WCAG AA contrast in both themes; status is never colour-only (always a label).
- **Radius scale**: 8 px controls, 12 px cards, 16 px modals. Pills only for chips.
- **Keyboard and screen readers**: visible focus ring, dialogs trap focus and close with Esc, icon buttons have labels, form errors are announced and tied to their field.
- **Motion**: only in response to a click; respects "reduce motion".
- **Responsive**: the same top bar wraps on phones (search gets its own row, no hamburger menu).
- **Errors** say what is wrong and how to fix it, next to the field.

## Sign-up
- Rules are listed up front and tick off live while typing (recognition over recall). The server uses the same file (`public/js/password-policy.js`), so browser and API can never disagree.
- Length matters most, so the minimum is 10 characters; the complexity rules and a common-password check (`Password1!` is rejected) catch what length alone misses.
- Usernames are stored in lower case, so `Rica` and `rica` are one account. A taken name shows **Username already exists** beside the field (HTTP 409).

## Adding your own TV shows
- Only the title is required; everything else is optional.
- Posters are checked in the browser first (instant feedback), then again on the server, and stored untouched. The rules sit next to the upload box.
- Destructive actions (delete show, remove from library) ask for confirmation and say what will be lost.
