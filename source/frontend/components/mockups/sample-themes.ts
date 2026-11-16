/**
 * Two made-up businesses' themes, as START-HERE.md's step 2 would set them:
 * the same shadcn tokens styles.css sets, only other values, so a mockup
 * can show how it holds up once it's restyled. One is green and very
 * rounded; the other navy, sharp, with serif headings (`--font-heading`).
 * Each overrides the tokens on a wrapper, which every utility reads.
 */
export const SAMPLE_THEMES = `
.theme-rounded {
    --background: oklch(0.99 0.004 140);
    --foreground: oklch(0.21 0.03 155);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.21 0.03 155);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.21 0.03 155);
    --primary: oklch(0.48 0.12 152);
    --primary-foreground: oklch(0.99 0.01 150);
    --secondary: oklch(0.955 0.02 140);
    --secondary-foreground: oklch(0.28 0.05 152);
    --muted: oklch(0.96 0.012 140);
    --muted-foreground: oklch(0.47 0.03 150);
    --accent: oklch(0.94 0.03 145);
    --accent-foreground: oklch(0.28 0.05 152);
    --border: oklch(0.9 0.02 140);
    --input: oklch(0.9 0.02 140);
    --ring: oklch(0.62 0.11 152);
    --radius: 1rem;
}
.theme-sharp {
    --background: oklch(0.992 0.002 260);
    --foreground: oklch(0.2 0.04 262);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.2 0.04 262);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.2 0.04 262);
    --primary: oklch(0.34 0.1 263);
    --primary-foreground: oklch(0.98 0.005 260);
    --secondary: oklch(0.955 0.01 262);
    --secondary-foreground: oklch(0.25 0.06 262);
    --muted: oklch(0.96 0.008 262);
    --muted-foreground: oklch(0.47 0.035 262);
    --accent: oklch(0.94 0.015 262);
    --accent-foreground: oklch(0.25 0.06 262);
    --border: oklch(0.89 0.012 262);
    --input: oklch(0.89 0.012 262);
    --ring: oklch(0.55 0.1 262);
    --radius: 0.25rem;
}
.theme-sharp .font-heading {
    font-family: ui-serif, Georgia, "Times New Roman", serif;
    letter-spacing: -0.01em;
}
@media (prefers-color-scheme: dark) {
    .theme-rounded {
        --background: oklch(0.19 0.02 155);
        --foreground: oklch(0.96 0.012 140);
        --card: oklch(0.23 0.025 155);
        --card-foreground: oklch(0.96 0.012 140);
        --popover: oklch(0.23 0.025 155);
        --popover-foreground: oklch(0.96 0.012 140);
        --primary: oklch(0.76 0.14 150);
        --primary-foreground: oklch(0.2 0.04 155);
        --secondary: oklch(0.28 0.03 155);
        --secondary-foreground: oklch(0.96 0.012 140);
        --muted: oklch(0.27 0.025 155);
        --muted-foreground: oklch(0.74 0.03 145);
        --accent: oklch(0.3 0.04 155);
        --accent-foreground: oklch(0.96 0.012 140);
        --border: oklch(1 0 0 / 11%);
        --input: oklch(1 0 0 / 16%);
        --ring: oklch(0.6 0.12 150);
    }
    .theme-sharp {
        --background: oklch(0.18 0.03 263);
        --foreground: oklch(0.96 0.008 262);
        --card: oklch(0.22 0.035 263);
        --card-foreground: oklch(0.96 0.008 262);
        --popover: oklch(0.22 0.035 263);
        --popover-foreground: oklch(0.96 0.008 262);
        --primary: oklch(0.8 0.08 255);
        --primary-foreground: oklch(0.21 0.05 263);
        --secondary: oklch(0.27 0.035 263);
        --secondary-foreground: oklch(0.96 0.008 262);
        --muted: oklch(0.26 0.03 263);
        --muted-foreground: oklch(0.74 0.03 260);
        --accent: oklch(0.29 0.04 263);
        --accent-foreground: oklch(0.96 0.008 262);
        --border: oklch(1 0 0 / 12%);
        --input: oklch(1 0 0 / 16%);
        --ring: oklch(0.6 0.08 258);
    }
}
`

export const THEMES = ["template", "rounded", "sharp"] as const
export type Theme = (typeof THEMES)[number]

export const THEME_NAMES: Record<Theme, string> = {
    template: "As shipped",
    rounded: "Green, rounded",
    sharp: "Navy, sharp"
}
