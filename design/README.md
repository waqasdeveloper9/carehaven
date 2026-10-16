# Approved CareHaven visual direction

The approved concept combines the references supplied by the user: soft pink child cards, mint and emerald charity layouts, and navy accents with warm editorial photography. The application retains its existing care, finance, authorization, and approval workflows.

## Theme

Shared design tokens live in `app/globals.css`. Artwork paths and chart settings live in `lib/brand.ts`; the two image paths can also be overridden using the documented environment variables. The default application name is CareHaven and remains configurable.

| Token | Value | Purpose |
| --- | --- | --- |
| Emerald | `#23856a` | Navigation, primary actions, contributions |
| Navy | `#24264f` | Headings, donor wallet, readable text |
| Mint | `#e8f4ee` | Welcome banner, secondary surfaces |
| Blush | `#fbeaf0` | Child cards and attention highlights |
| Pink | `#df5b8b` | Small accents and expense indicators |
| Ivory | `#f8f9f6` | Application background |

## Approved references

- `approved/admin-overview.webp`
- `approved/children-and-mobile.webp`
- `approved/donor-portal.webp`

Reference figures and names are illustrative. The implemented charts and financial cards calculate their values from the workspace ledger. No growth percentages or financial values from the concept images are used as live statistics.

## Artwork

The built-in ImageGen tool generated both final assets. Optimized WebP derivatives are stored in the repository and served locally:

- `public/images/care-learning.webp`: decorative classroom photograph used by the welcome banner and login story panel.
- `public/images/demo-portraits.webp`: a four-quadrant portrait atlas, used exclusively for fictional demo records. CSS displays individual quadrants. Real records use authorized private profile photos when available and initials otherwise.

The imagery is AI-generated illustration, not photographs of actual beneficiaries. Demo pages identify illustrative portraits explicitly.

### Generation prompt set

**Classroom artwork:** Create a polished natural editorial photograph for a nonprofit child care application hero banner. Wide landscape 3:2 composition. A kind female caregiver and two fictional school-age children around 8 to 10 years old reading an illustrated book together at a classroom table, warm genuine relaxed smiles, fully clothed in muted green and blush casual sweaters, soft window light, subtle indoor plants and tidy classroom shelves softly blurred behind. Crop medium-close with people toward center-right and calm pale sage negative space left, focus on learning and dignity. Palette complements emerald, pale mint, warm ivory, soft blush and deep navy. Premium realistic photography, authentic skin texture, not plastic. This will be used as decorative imagery, NOT a photo of any real beneficiary. No text, numbers, logos, watermarks, graphical frames, interface, collage or screens. Single edge-to-edge photo.

**Demo portrait atlas:** Generate ONE photographic portrait sprite sheet asset, square canvas divided into EXACTLY FOUR EQUAL seamless quadrants, 2 columns and 2 rows, no gaps, no border, no text, no interface. Each quadrant is a separate warm realistic stock-style head-and-shoulders portrait of a FICTIONAL fully clothed school-age child in a tidy classroom with blurred shelves and plants. Top-left: smiling girl age9 with dark hair and blush pink sweater. Top-right: smiling boy age11 dark hair and deep green sweater. Bottom-left: smiling girl age8 with long brown hair and a sage sweater. Bottom-right: smiling boy age13 short dark hair in navy sweater. Diverse natural facial features, respectful optimistic everyday learning atmosphere, no real identities copied from anywhere. Faces occupy center of their respective quadrant, entire heads comfortably inside each quadrant with breathing room. Soft daylight consistent across all four. Elegant restrained palette of emerald, pale mint, blush, ivory. No writing anywhere. This is fictional demo-only child portrait artwork for an orphanage management app, never actual records.

## Authentication and mobile

The login and registration gate share the same theme, including the pending approval state. `/login` provides a direct sign-in page. The story panel becomes a compact brand header on phones. Desktop navigation collapses to the existing mobile menu and bottom navigation; financial tables scroll within their own panels.

No database migration or policy change is required for this visual update.
