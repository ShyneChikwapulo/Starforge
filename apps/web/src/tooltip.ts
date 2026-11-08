const MARGIN = 8;
const OFFSET = 16;

/**
 * Where to put a tooltip of the given size next to a point, keeping it inside the viewport.
 * It goes below and to the right of the point, flipping above when there is no room below.
 */
export function placeTooltip(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const left = Math.min(
    Math.max(MARGIN, x + OFFSET),
    Math.max(MARGIN, viewportWidth - width - MARGIN),
  );
  const below = y + OFFSET;
  const top = below + height > viewportHeight - MARGIN ? y - OFFSET - height : below;
  return { left, top: Math.max(MARGIN, top) };
}

export interface Tooltip {
  show(entity: { title: string; detail: string }, x: number, y: number): void;
  hide(): void;
}

/** A ring marker and a tooltip. Text goes in through textContent only: names come from user data. */
export function createTooltip(marker: HTMLElement, tooltip: HTMLElement): Tooltip {
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  tooltip.replaceChildren(title, detail);

  return {
    show(entity, x, y) {
      title.textContent = entity.title;
      detail.textContent = entity.detail;
      marker.hidden = false;
      tooltip.hidden = false;
      marker.style.transform = `translate(${x}px, ${y}px)`;
      const { left, top } = placeTooltip(
        x,
        y,
        tooltip.offsetWidth,
        tooltip.offsetHeight,
        window.innerWidth,
        window.innerHeight,
      );
      tooltip.style.transform = `translate(${left}px, ${top}px)`;
    },
    hide() {
      marker.hidden = true;
      tooltip.hidden = true;
    },
  };
}
