import React, { useEffect, useRef } from 'react';
import type { BrawlerId } from '../types/brawl';
import { drawCharacter, drawCharacterShadow } from '../render/characterArt';
import { CHARACTER_STYLES } from '../render/characterStyles';

interface CharacterPortraitProps {
  brawlerId: BrawlerId;
  /** Rendered size in CSS pixels. */
  size: number;
  /** Idle animation makes the roster feel alive; off for dense lists. */
  animated?: boolean;
  className?: string;
}

/**
 * Renders a character using the same vector art as the arena.
 *
 * The lobby used to load a PNG per character. Drawing the live art instead
 * means the roster can never disagree with what you actually play, there is no
 * portrait asset to keep in sync, and it stays sharp on any display.
 */
export const CharacterPortrait: React.FC<CharacterPortraitProps> = React.memo(({
  brawlerId,
  size,
  animated = false,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const style = CHARACTER_STYLES[brawlerId] ?? CHARACTER_STYLES.mira;
    let animId = 0;
    const started = performance.now();

    const paint = (now: number) => {
      const t = (now - started) / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size / 2, size * 0.52);

      // Facing the viewer: forward is +X in the body's local frame, so a
      // quarter turn points the head toward the bottom of the frame.
      const sway = animated ? Math.sin(t * 1.6) * 0.16 : 0;
      const scale = size * 0.42;

      drawCharacterShadow(ctx, scale);
      drawCharacter(ctx, style, {
        aimAngle: Math.PI / 2 + sway,
        moveAngle: Math.PI / 2 + sway,
        speed01: 0,
        time: t,
        recoil01: 0,
        scale,
      });
      ctx.restore();

      if (animated) animId = requestAnimationFrame(paint);
    };

    animId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(animId);
  }, [brawlerId, size, animated]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
    />
  );
});
CharacterPortrait.displayName = 'CharacterPortrait';
