import { palettes } from './tokens';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string): number {
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

describe('design-system accessibility contracts', () => {
  it.each(['light', 'dark'] as const)(
    '%s palette keeps normal text and status labels at WCAG AA contrast',
    (mode) => {
      const colors = palettes[mode];
      const surfaces = [colors.bg, colors.surface, colors.surface2];
      const foregrounds = [
        colors.text,
        colors.text2,
        colors.text3,
        colors.ember,
        colors.signal,
        colors.verified,
        colors.constrained,
        colors.blackout,
        colors.link,
      ];

      for (const foreground of foregrounds) {
        for (const background of surfaces) {
          expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it.each(['light', 'dark'] as const)(
    '%s filled controls keep their labels at WCAG AA contrast',
    (mode) => {
      const colors = palettes[mode];
      for (const fill of [colors.ember, colors.signal, colors.blackout]) {
        expect(contrast(colors.onAccent, fill)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
