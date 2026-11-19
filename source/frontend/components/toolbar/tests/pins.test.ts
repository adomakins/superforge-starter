import { expect, test } from "vitest"
import { nearestPin, pinCenter, pinToward } from "../pins"

// Where the toolbar snaps when it's let go, and where the arrow keys move
// it, in a 1440 by 900 window

const TOOLBAR = { width: 240, height: 40 }
const WINDOW = { width: 1440, height: 900 }

test("each pin keeps the toolbar 16 pixels from the window's edges", () => {
    expect(pinCenter("bottom-center", TOOLBAR, WINDOW)).toEqual({
        x: 720,
        y: 864
    })
    expect(pinCenter("top-left", TOOLBAR, WINDOW)).toEqual({ x: 136, y: 36 })
    expect(pinCenter("bottom-right", TOOLBAR, WINDOW)).toEqual({
        x: 1304,
        y: 864
    })
})

test("letting go snaps to the nearest pin", () => {
    expect(nearestPin({ x: 700, y: 800 }, TOOLBAR, WINDOW)).toBe(
        "bottom-center"
    )
    expect(nearestPin({ x: 1200, y: 120 }, TOOLBAR, WINDOW)).toBe("top-right")
    expect(nearestPin({ x: 200, y: 700 }, TOOLBAR, WINDOW)).toBe("bottom-left")
    // The middle of the top is nearer a top corner than the bottom middle
    expect(nearestPin({ x: 600, y: 60 }, TOOLBAR, WINDOW)).toBe("top-left")
})

test("the arrow keys move along a row, and between the rows", () => {
    expect(pinToward("bottom-center", "left")).toBe("bottom-left")
    expect(pinToward("bottom-center", "right")).toBe("bottom-right")
    expect(pinToward("bottom-left", "up")).toBe("top-left")
    expect(pinToward("top-right", "down")).toBe("bottom-right")
    // Across the top's missing middle
    expect(pinToward("top-left", "right")).toBe("top-right")
})

test("an arrow toward nothing stays put", () => {
    expect(pinToward("bottom-left", "left")).toBe("bottom-left")
    expect(pinToward("top-left", "up")).toBe("top-left")
    expect(pinToward("bottom-center", "up")).toBe("bottom-center")
})
