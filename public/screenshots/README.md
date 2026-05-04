# Product screenshots

Drop real product screenshots in this folder to replace the animated SVG mockups
on the landing page.

## How it works

The `<ProductMockup>` component (in `src/components/landing/product-mockup.tsx`)
checks for a real screenshot first. If it exists, it renders the image with a
subtle gradient frame and shadow. If not, it falls back to the animated SVG.

To swap a feature mockup, save a PNG in this folder and update the `screenshot`
field for the matching feature in `src/lib/landing-content.ts`:

```ts
{
  slug: 'analytics',
  // ...
  screenshot: '/screenshots/analytics.png',  // ← path relative to /public
},
```

## Recommended specs

- **Format:** PNG (preferred for crisp UI) or WebP
- **Width:** 2400px wide (renders crisp on retina)
- **Aspect ratio:** ~16:10 (1280×800 logical) for feature mockups
- **Hero dashboard:** ~16:9 (1920×1080 logical) for the homepage hero
- **Background:** Light theme — these embed in white sections

## Capture tips

- Use real-but-not-sensitive data (your own portfolio brands are fine)
- Crop tight — no browser chrome, no OS dock
- Keep numbers impressive ($24K GMV looks better than $14)
- Add a 1px shadow if your screenshot tool doesn't include one
- For Mac: ScreenStudio or CleanShot X
- For Windows: ShareX or the built-in Snipping Tool + minor cleanup

## Suggested filenames

- `hero-dashboard.png` — main homepage mockup
- `analytics.png` — Analytics feature row
- `creator-rankings.png` — Creator Rankings feature row
- `multi-brand.png` — Multi-Brand feature row
- `daily-briefs.png` — Daily Briefs feature row
- `creator-portal.png` — Creator Portal feature row
- `tempo-bot.png` — Tempo Bot Discord feature
