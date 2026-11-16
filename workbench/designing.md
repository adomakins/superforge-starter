# Designing what people see

Read `PRODUCT.md` and `DESIGN.md` first: they say who the business is, how
it sounds and how it looks, and they win over anything here. This doc is
the floor under them: the habits that make a site look like every other
generated site, and the checks every page and component passes before it's
done.

## Start from the business

- **The look is the tokens.** Draw with the theme tokens `styles.css` sets
  (`bg-primary`, `text-muted-foreground`, `rounded-md`), never raw hex
  codes or Tailwind's palette (`bg-blue-600`) in a component. A new color
  is a new token, recorded in DESIGN.md.
- **The words are the business's.** Write in the voice PRODUCT.md
  describes. Never invent testimonials, ratings, customer counts, prices,
  awards or claims. Where real content is missing, leave a plain
  placeholder and tell the owner what's needed.
- **Fonts are real.** Use the fonts DESIGN.md names, installed from
  Fontsource, never a system font (Arial, Helvetica, the device's default)
  as the display face.

## Avoid the generated look

Each of these is what an agent reaches for when nothing was decided. Use
one only when the business asked for it.

- A small label above a heading (an "eyebrow"), often uppercase or
  monospace. Let the heading stand on its own.
- A row of same-size cards, each an icon, a heading and a line, as the
  structure of the page. And never cards inside cards.
- A big number with a small label as the hero ("10,000+ happy customers").
- Section numbers (01, 02, 03) when the order means nothing.
- Gradient text. Emphasis comes from size and weight.
- Glowing colored shadows, frosted glass as decoration, or hard offset
  shadows (`4px 4px 0`) on a site that isn't deliberately brutalist.
- A thick colored bar down the left edge of a card, list item or alert.
- Monospace to look "technical" when the text isn't code or numbers.
- Emoji or symbols standing in for icons. Use one icon set (`lucide-react`
  is installed) at one size and stroke.
- A modal for something that doesn't need to interrupt.

## Check the result

Run `pnpm dev` and look at the page at a phone's width and a computer's, in
light and dark. Check all of these in the same look, then fix and look
again:

- **Contrast.** Body text at least 4.5:1 against its background, large text
  at least 3:1, in both modes. Secondary text on a colored background is
  tinted from that color, not gray.
- **Type.** Body lines 65 to 75 characters wide (`max-w-prose`). Headings
  balanced (`text-balance`) and clearly larger or heavier than the step
  below. Display text no bigger than about 6rem, letter spacing no tighter
  than -0.04em. Nothing overflows on a phone with the real copy.
- **Spacing.** Tight inside a group, generous between groups, more space
  above a heading than below it.
- **Depth.** A shadow has an offset and a soft blur.
- **States.** Hover, keyboard focus (a visible ring), disabled, loading,
  error and empty, wherever each can happen.
- **What the browser draws.** Text selection, focus rings, link underline
  offset and numbers in tables (`tabular-nums`) use the theme, not the
  browser's defaults.
- **Motion.** At most one deliberate moment, easing out, and nothing moves
  under `prefers-reduced-motion`.
- **Copy.** Buttons say what they do ("Book a visit", not "Submit"). Errors
  say what went wrong and how to fix it.

## Going further

For a full redesign, a design review or a polish pass, the owner can
install [Impeccable](https://impeccable.style), the design skill several of
these rules come from. It works in Claude Code, Cursor, Codex and others:

```bash
npx impeccable install
```

It asks its own questions and keeps its files in `.impeccable/`.

Several rules here are adapted, in our own words, from Impeccable by Paul
Bakaus (<https://github.com/pbakaus/impeccable>, Apache License 2.0).
