/**
 * Procedural top-down character rendering.
 *
 * The game previously drew full-body, front-facing portrait PNGs into a
 * top-down arena and flipped them horizontally to indicate facing. That is the
 * single biggest reason the game read as wrong: the camera looks down at the
 * floor while the characters stood upright facing the viewer, so they sat on
 * the ground like stickers rather than occupying it.
 *
 * Characters are now assembled from vector parts drawn in the body's own local
 * space — shadow, legs, torso, arms, weapon, head — which buys three things the
 * sprites could not:
 *
 *  - a genuine overhead silhouette that rotates with aim;
 *  - legs that track the direction of travel independently of where the
 *    character is aiming, which is what makes strafing read correctly;
 *  - real animation (walk cycle, weapon recoil, squash on acceleration) without
 *    a single frame of hand-drawn art, crisp at any zoom or pixel density.
 *
 * Everything here is original artwork defined in code. No third-party assets.
 */

export type Build = 'light' | 'medium' | 'heavy';

export type WeaponKind =
  | 'scattergun'
  | 'twin_blasters'
  | 'gauntlets'
  | 'launcher'
  | 'satchel'
  | 'blades'
  /** A bottle held out by the neck, ready to be thrown. */
  | 'flask'
  /** A stubby nail gun in one hand, a folded tripod in the other. */
  | 'toolgun'
  /** A resonator held two-handed at chest height. */
  | 'horn'
  /** A slab hammer carried over one shoulder. */
  | 'hammer'
  /** A long cue held two-handed, tip forward. */
  | 'cue'
  /** Two short curved daggers, held low. */
  | 'daggers'
  /** A hooked chain, coiled in one hand. */
  | 'hook'
  /** A crystal staff. */
  | 'frost';

export type Headgear =
  | 'hood'
  | 'cap'
  | 'mask'
  | 'goggles'
  | 'crest'
  /** A welder's visor, flipped down. */
  | 'visor'
  /** A full helm with a raised comb. */
  | 'helm';

/**
 * What the character carries on its back.
 *
 * Seen from above, two characters of the same build are the same blob. The
 * back item is the cheapest way to break that: it changes the outline, which
 * is the only thing you can actually read at gameplay zoom.
 */
export type BackItem = 'none' | 'tank' | 'cape' | 'pack' | 'coil' | 'drum' | 'wings';

export interface CharacterStyle {
  /** Jacket / main garment. */
  primary: string;
  /** Trousers and shadowed panels. */
  secondary: string;
  /** Trim, scarf, glow — the colour the player identifies them by. */
  accent: string;
  skin: string;
  hair: string;
  build: Build;
  weapon: WeaponKind;
  headgear: Headgear;
  /** Silhouette breaker. Defaults to nothing. */
  back?: BackItem;
  /** Eye colour. Defaults to near-black. */
  eyes?: string;
}

export interface CharacterPose {
  /** Where the character is aiming. The torso and weapon follow this. */
  aimAngle: number;
  /** Direction of travel. The legs follow this. */
  moveAngle: number;
  /** Movement speed normalised to 0..1, driving the walk cycle. */
  speed01: number;
  /** Seconds, for cyclic animation. */
  time: number;
  /** 0..1, decaying after each shot. Kicks the weapon and shoulders back. */
  recoil01: number;
  /** Overall size in world units (the body's shoulder width is ~0.8 of this). */
  scale: number;
}

const OUTLINE = '#15161f';

/**
 * Lightens or darkens a hex colour.
 *
 * Flat fills read as paper cut-outs from above. One lighter band along the
 * lit edge and one darker band under it is enough to make a body look round,
 * and it costs nothing next to a gradient.
 */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(amount > 0
      ? channel + (255 - channel) * amount
      : channel * (1 + amount))));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/** Where the light comes from, in the body's own frame. Constant, so every
 *  character is lit the same way and the set reads as one piece of art. */
const LIGHT_ANGLE = -Math.PI * 0.72;

interface BuildMetrics {
  shoulder: number;
  chest: number;
  headRadius: number;
  legLength: number;
  legWidth: number;
  armLength: number;
  outline: number;
}

/**
 * Seen from directly above, a head drawn at character-art proportions covers
 * the entire torso and every character collapses into the same disc. Heads are
 * therefore smaller than a side view would use, shoulders wider, and arms reach
 * well clear of the head so the weapon stays legible at gameplay zoom.
 */
const BUILDS: Record<Build, BuildMetrics> = {
  light: { shoulder: 0.46, chest: 0.34, headRadius: 0.23, legLength: 0.3, legWidth: 0.14, armLength: 0.66, outline: 0.05 },
  medium: { shoulder: 0.52, chest: 0.39, headRadius: 0.25, legLength: 0.31, legWidth: 0.16, armLength: 0.68, outline: 0.055 },
  heavy: { shoulder: 0.66, chest: 0.5, headRadius: 0.28, legLength: 0.32, legWidth: 0.21, armLength: 0.7, outline: 0.065 },
};

/** Rounded capsule from (x1, y1) to (x2, y2). The basic limb primitive. */
function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = radius * 2;
  ctx.stroke();
}

/** Fills then outlines the current path, the look the whole set is built on. */
function fillStroke(ctx: CanvasRenderingContext2D, fill: string, lineWidth: number): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipsePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation = 0
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
}

/**
 * Ground shadow. Drawn in world space (unrotated) so it stays an ellipse on the
 * floor no matter which way the body faces, and lifts with the body on a jump.
 */
export function drawCharacterShadow(
  ctx: CanvasRenderingContext2D,
  scale: number,
  elevation = 0
): void {
  // Higher bodies cast a smaller, softer, further-offset shadow.
  const lift = Math.min(1, elevation / 90);
  const shrink = 1 - lift * 0.35;

  ctx.save();
  ctx.globalAlpha = 0.34 * (1 - lift * 0.45);
  ctx.fillStyle = '#05060b';
  ellipsePath(ctx, 0, scale * 0.42, scale * 0.52 * shrink, scale * 0.24 * shrink);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a character centred on the origin, facing `pose.aimAngle`.
 *
 * The caller is responsible for translating to the body position and for the
 * shadow, so bodies can be depth-sorted against the shadows of others.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  style: CharacterStyle,
  pose: CharacterPose
): void {
  const m = BUILDS[style.build];
  const s = pose.scale;
  const outline = m.outline * s;

  // Walk cycle: faster and wider the quicker the character moves.
  const cadence = pose.time * (7 + pose.speed01 * 7);
  const stride = Math.sin(cadence) * s * 0.17 * pose.speed01;
  const bob = Math.abs(Math.cos(cadence)) * s * 0.035 * pose.speed01;

  // Recoil pushes the whole upper body back along the aim axis.
  const kick = pose.recoil01 * s * 0.1;

  // Standing still is not the same as being a still image. A slow swell on
  // the chest is the difference between a character and a sprite.
  const breath = (1 - pose.speed01) * Math.sin(pose.time * 1.9) * s * 0.012;

  ctx.save();
  ctx.rotate(pose.aimAngle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawBackItem(ctx, style, m, s, outline, pose, kick);

  /* ---- legs ------------------------------------------------------------
   * Drawn in the movement frame rather than the aim frame. A character
   * backpedalling while shooting should have its legs pointing the way it is
   * actually travelling — this is what sells strafing.
   */
  ctx.save();
  ctx.rotate(pose.moveAngle - pose.aimAngle);
  ctx.strokeStyle = OUTLINE;
  const legR = m.legWidth * s;
  for (const side of [-1, 1]) {
    const swing = stride * side;
    const offset = side * m.chest * s * 0.52;
    // Outline pass, then the fill on top: cheaper than stroking each leg twice
    // and keeps the silhouette unbroken where the legs overlap the torso.
    ctx.strokeStyle = OUTLINE;
    capsule(ctx, swing * 0.2, offset, swing, offset, legR + outline * 0.9);
    ctx.strokeStyle = style.secondary;
    capsule(ctx, swing * 0.2, offset, swing, offset, legR);
  }
  ctx.restore();

  /* ---- torso ---------------------------------------------------------- */
  const torsoX = -kick;
  const chestR = m.chest * s + bob + breath;
  const shoulderR = m.shoulder * s + breath;
  ellipsePath(ctx, torsoX, 0, chestR, shoulderR);
  fillStroke(ctx, style.primary, outline * 2);

  // Round the torso off: a lit crescent along the light side and a shadow
  // under the opposite one, both clipped to the body.
  ctx.save();
  ellipsePath(ctx, torsoX, 0, chestR, shoulderR);
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ellipsePath(
    ctx,
    torsoX + Math.cos(LIGHT_ANGLE) * chestR * 0.45,
    Math.sin(LIGHT_ANGLE) * shoulderR * 0.5,
    chestR * 0.82,
    shoulderR * 0.72
  );
  ctx.fillStyle = shade(style.primary, 0.3);
  ctx.fill();
  ctx.globalAlpha = 0.4;
  ellipsePath(
    ctx,
    torsoX - Math.cos(LIGHT_ANGLE) * chestR * 0.7,
    -Math.sin(LIGHT_ANGLE) * shoulderR * 0.78,
    chestR * 0.9,
    shoulderR * 0.78
  );
  ctx.fillStyle = shade(style.primary, -0.45);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Chest accent: a wedge pointing forward. Doubles as a facing cue when the
  // character is small on screen.
  ctx.beginPath();
  ctx.moveTo(torsoX + m.chest * s * 0.75, 0);
  ctx.lineTo(torsoX - m.chest * s * 0.15, -m.shoulder * s * 0.62);
  ctx.lineTo(torsoX - m.chest * s * 0.15, m.shoulder * s * 0.62);
  ctx.closePath();
  ctx.fillStyle = style.accent;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Shoulder pads in the accent colour. From above these are the largest flat
  // areas on the body, so they carry most of the character's identity at a
  // glance — far more than the head does.
  for (const side of [-1, 1]) {
    ellipsePath(
      ctx,
      torsoX - m.chest * s * 0.05,
      side * m.shoulder * s * 0.74,
      m.chest * s * 0.42,
      m.shoulder * s * 0.34,
      side * 0.25
    );
    fillStroke(ctx, style.accent, outline * 1.5);
  }

  /* ---- head ------------------------------------------------------------ */
  const headX = m.chest * s * 0.34 - kick * 1.4;
  const headR = m.headRadius * s;

  ellipsePath(ctx, headX, 0, headR, headR * 0.96);
  fillStroke(ctx, style.skin, outline * 1.8);

  ctx.save();
  ellipsePath(ctx, headX, 0, headR, headR * 0.96);
  ctx.clip();
  ctx.globalAlpha = 0.45;
  ellipsePath(
    ctx,
    headX - Math.cos(LIGHT_ANGLE) * headR * 0.75,
    -Math.sin(LIGHT_ANGLE) * headR * 0.8,
    headR * 0.95,
    headR * 0.85
  );
  ctx.fillStyle = shade(style.skin, -0.4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  drawFace(ctx, style, headX, headR, outline);
  drawHeadgear(ctx, style, headX, headR, outline);

  /* ---- arms and weapon -------------------------------------------------
   * Drawn last, over the head: from this angle the arms are nearer the camera
   * than the crown, and keeping the weapon on top is what makes each character
   * identifiable in a fight.
   */
  drawArmsAndWeapon(ctx, style, m, s, outline, kick);

  ctx.restore();
}

/**
 * Eyes.
 *
 * The single largest return on effort in the whole set. A plain disc for a
 * head reads as a prop; two eyes looking the way the character is aiming
 * reads as somebody, and it costs eight lines. They sit forward of centre
 * because the head is seen from above and in front.
 */
function drawFace(
  ctx: CanvasRenderingContext2D,
  style: CharacterStyle,
  headX: number,
  headR: number,
  outline: number
): void {
  // A visor or a full helm covers the face; drawing eyes under it would show
  // them through the metal.
  if (style.headgear === 'visor' || style.headgear === 'helm' || style.headgear === 'mask') {
    return;
  }

  const eyeX = headX + headR * 0.42;
  const eyeY = headR * 0.42;
  const eyeR = headR * 0.2;

  for (const side of [-1, 1]) {
    ellipsePath(ctx, eyeX, side * eyeY, eyeR * 1.05, eyeR);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = outline * 0.9;
    ctx.stroke();

    // Pupil pushed forward, so the gaze follows the aim rather than staring
    // blankly out of the middle of the eye.
    ellipsePath(ctx, eyeX + eyeR * 0.3, side * eyeY, eyeR * 0.55, eyeR * 0.6);
    ctx.fillStyle = style.eyes ?? '#1e1b2e';
    ctx.fill();
  }

  // Brow: one dark wedge across both eyes. Gives the face an expression
  // without needing a mouth, which would be unreadable at this size.
  ctx.beginPath();
  ctx.moveTo(eyeX - eyeR * 0.6, -eyeY - eyeR * 1.25);
  ctx.lineTo(eyeX + eyeR * 0.9, -eyeY - eyeR * 0.5);
  ctx.lineTo(eyeX + eyeR * 0.9, eyeY + eyeR * 0.5);
  ctx.lineTo(eyeX - eyeR * 0.6, eyeY + eyeR * 1.25);
  ctx.closePath();
  ctx.fillStyle = shade(style.hair, -0.15);
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Whatever the character wears on its back, drawn under the body.
 *
 * From directly above, two characters of the same build are the same blob
 * with different colours. Colour is the first thing to go when the screen is
 * busy, so identity has to live in the outline — which is what this is for.
 */
function drawBackItem(
  ctx: CanvasRenderingContext2D,
  style: CharacterStyle,
  m: BuildMetrics,
  s: number,
  outline: number,
  pose: CharacterPose,
  kick: number
): void {
  const back = style.back ?? 'none';
  if (back === 'none') return;

  const x = -m.chest * s * 0.75 - kick * 0.4;

  switch (back) {
    case 'tank': {
      // Twin cylinders, like a pair of pressure bottles strapped on.
      for (const side of [-1, 1]) {
        ellipsePath(ctx, x, side * m.shoulder * s * 0.4, m.chest * s * 0.3, m.chest * s * 0.19);
        fillStroke(ctx, shade(style.secondary, 0.12), outline * 1.5);
        ellipsePath(
          ctx,
          x - m.chest * s * 0.12,
          side * m.shoulder * s * 0.4,
          m.chest * s * 0.11,
          m.chest * s * 0.11
        );
        fillStroke(ctx, style.accent, outline);
      }
      break;
    }

    case 'cape': {
      // Trails behind and sways out of phase with the walk, so the body does
      // not look like it is sliding.
      const sway = Math.sin(pose.time * 6 + 1) * 0.22 * (0.35 + pose.speed01);
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(sway);
      ctx.beginPath();
      ctx.moveTo(m.chest * s * 0.4, -m.shoulder * s * 0.8);
      ctx.quadraticCurveTo(-m.chest * s * 1.3, -m.shoulder * s * 0.5, -m.chest * s * 1.5, 0);
      ctx.quadraticCurveTo(-m.chest * s * 1.3, m.shoulder * s * 0.5, m.chest * s * 0.4, m.shoulder * s * 0.8);
      ctx.closePath();
      fillStroke(ctx, shade(style.accent, -0.25), outline * 1.6);
      ctx.restore();
      break;
    }

    case 'pack': {
      ctx.beginPath();
      ctx.roundRect(
        x - m.chest * s * 0.42,
        -m.shoulder * s * 0.62,
        m.chest * s * 0.8,
        m.shoulder * s * 1.24,
        m.chest * s * 0.22
      );
      fillStroke(ctx, shade(style.secondary, 0.1), outline * 1.7);
      // Buckle strip, so it does not read as a second torso.
      ctx.beginPath();
      ctx.roundRect(
        x - m.chest * s * 0.3,
        -m.shoulder * s * 0.16,
        m.chest * s * 0.56,
        m.shoulder * s * 0.32,
        m.chest * s * 0.1
      );
      fillStroke(ctx, style.accent, outline);
      break;
    }

    case 'coil': {
      // Three rings stacked outward: reads as machinery at a glance.
      for (let i = 0; i < 3; i++) {
        const r = m.chest * s * (0.4 - i * 0.09);
        ellipsePath(ctx, x - i * m.chest * s * 0.14, 0, r, r * 1.35);
        fillStroke(ctx, i % 2 === 0 ? style.accent : shade(style.secondary, 0.15), outline * 1.3);
      }
      break;
    }

    case 'drum': {
      ellipsePath(ctx, x, 0, m.chest * s * 0.44, m.shoulder * s * 0.66);
      fillStroke(ctx, shade(style.secondary, 0.14), outline * 1.7);
      ellipsePath(ctx, x, 0, m.chest * s * 0.2, m.shoulder * s * 0.3);
      fillStroke(ctx, style.accent, outline * 1.2);
      break;
    }

    case 'wings': {
      // Two swept blades that flare when the character moves.
      const flare = 0.3 + pose.speed01 * 0.5;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(x + m.chest * s * 0.2, side * m.shoulder * s * 0.3);
        ctx.rotate(side * flare);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-m.chest * s * 0.9, side * m.shoulder * s * 0.3, -m.chest * s * 1.25, side * m.shoulder * s * 1.0);
        ctx.quadraticCurveTo(-m.chest * s * 0.5, side * m.shoulder * s * 0.55, 0, side * m.shoulder * s * 0.3);
        ctx.closePath();
        fillStroke(ctx, shade(style.accent, -0.1), outline * 1.4);
        ctx.restore();
      }
      break;
    }
  }
}

function drawArmsAndWeapon(
  ctx: CanvasRenderingContext2D,
  style: CharacterStyle,
  m: BuildMetrics,
  s: number,
  outline: number,
  kick: number
): void {
  const reach = m.armLength * s - kick;
  const shoulderY = m.shoulder * s * 0.72;
  const armR = m.legWidth * s * 0.82;

  const arm = (side: number, forward: number, spread: number) => {
    ctx.strokeStyle = OUTLINE;
    capsule(ctx, 0, side * shoulderY, forward, side * spread, armR + outline * 0.9);
    ctx.strokeStyle = style.primary;
    capsule(ctx, 0, side * shoulderY, forward, side * spread, armR);
  };

  switch (style.weapon) {
    case 'scattergun': {
      // Both hands on a short, wide-barrelled gun held across the body.
      arm(-1, reach * 0.82, shoulderY * 0.42);
      arm(1, reach * 0.55, shoulderY * 0.86);

      ctx.save();
      ctx.translate(reach * 0.6, 0);
      ctx.beginPath();
      ctx.roundRect(-s * 0.1, -s * 0.13, s * 0.62, s * 0.26, s * 0.08);
      fillStroke(ctx, style.secondary, outline * 1.6);

      // Muzzle collar in the accent colour.
      ctx.beginPath();
      ctx.roundRect(s * 0.4, -s * 0.16, s * 0.14, s * 0.32, s * 0.06);
      fillStroke(ctx, style.accent, outline * 1.4);
      ctx.restore();
      break;
    }

    case 'twin_blasters': {
      // A pistol in each hand, arms held wide.
      for (const side of [-1, 1]) {
        arm(side, reach * 0.78, shoulderY * 0.95);
        ctx.save();
        ctx.translate(reach * 0.78, side * shoulderY * 0.95);
        ctx.beginPath();
        ctx.roundRect(-s * 0.04, -s * 0.09, s * 0.42, s * 0.18, s * 0.06);
        fillStroke(ctx, style.secondary, outline * 1.4);
        ctx.beginPath();
        ctx.roundRect(s * 0.3, -s * 0.11, s * 0.1, s * 0.22, s * 0.05);
        fillStroke(ctx, style.accent, outline * 1.2);
        ctx.restore();
      }
      break;
    }

    case 'gauntlets': {
      // Heavy fists, held close and low — a brawler's guard.
      for (const side of [-1, 1]) {
        arm(side, reach * 0.52, shoulderY * 1.02);
        ctx.save();
        ctx.translate(reach * 0.52, side * shoulderY * 1.02);
        ellipsePath(ctx, 0, 0, s * 0.19, s * 0.19);
        fillStroke(ctx, style.accent, outline * 1.8);
        // Knuckle plate.
        ellipsePath(ctx, s * 0.05, 0, s * 0.1, s * 0.11);
        fillStroke(ctx, style.secondary, outline * 1.1);
        ctx.restore();
      }
      break;
    }

    case 'launcher': {
      // Shoulder-mounted tube, braced by the off hand.
      arm(-1, reach * 0.5, shoulderY * 0.5);
      arm(1, reach * 0.7, shoulderY * 0.7);

      ctx.save();
      ctx.translate(reach * 0.28, -shoulderY * 0.55);
      ctx.beginPath();
      ctx.roundRect(-s * 0.3, -s * 0.13, s * 1.0, s * 0.26, s * 0.12);
      fillStroke(ctx, style.secondary, outline * 1.7);

      ctx.beginPath();
      ctx.roundRect(s * 0.52, -s * 0.17, s * 0.18, s * 0.34, s * 0.08);
      fillStroke(ctx, style.accent, outline * 1.4);

      // Exhaust vent at the back of the tube.
      ellipsePath(ctx, -s * 0.3, 0, s * 0.07, s * 0.12);
      fillStroke(ctx, '#3f3f52', outline);
      ctx.restore();
      break;
    }

    case 'satchel': {
      // One hand cocked back with a thrown charge, the other out for balance.
      arm(-1, reach * 0.42, shoulderY * 1.1);
      arm(1, reach * 0.66, shoulderY * 0.6);

      ctx.save();
      ctx.translate(reach * 0.66, shoulderY * 0.6);
      ellipsePath(ctx, 0, 0, s * 0.17, s * 0.17);
      fillStroke(ctx, style.accent, outline * 1.6);
      // Spines, so the charge reads as the thing it throws.
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = outline;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.14);
        ctx.lineTo(Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'flask': {
      // One arm cocked back with a bottle, the other shielding the face: the
      // posture of somebody about to throw something they do not want to drop.
      arm(-1, reach * 0.5, shoulderY * 1.05);
      arm(1, reach * 0.34, shoulderY * 1.15);

      ctx.save();
      ctx.translate(reach * 0.34, shoulderY * 1.15);
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.roundRect(-s * 0.08, -s * 0.1, s * 0.2, s * 0.2, s * 0.05);
      fillStroke(ctx, style.secondary, outline * 1.4);
      // Neck and burning rag.
      ctx.beginPath();
      ctx.roundRect(s * 0.1, -s * 0.045, s * 0.12, s * 0.09, s * 0.03);
      fillStroke(ctx, style.accent, outline * 1.1);
      ctx.restore();
      break;
    }

    case 'toolgun': {
      // Nail gun forward in the lead hand; the spare hand carries the tripod
      // it is about to put down, which is what the character is actually for.
      arm(-1, reach * 0.8, shoulderY * 0.5);
      arm(1, reach * 0.4, shoulderY * 1.1);

      ctx.save();
      ctx.translate(reach * 0.8, -shoulderY * 0.5);
      ctx.beginPath();
      ctx.roundRect(-s * 0.06, -s * 0.11, s * 0.4, s * 0.22, s * 0.07);
      fillStroke(ctx, style.secondary, outline * 1.5);
      ctx.beginPath();
      ctx.roundRect(s * 0.26, -s * 0.07, s * 0.14, s * 0.14, s * 0.04);
      fillStroke(ctx, style.accent, outline * 1.2);
      ctx.restore();

      ctx.save();
      ctx.translate(reach * 0.4, shoulderY * 1.1);
      ctx.rotate(0.6);
      ctx.beginPath();
      ctx.roundRect(-s * 0.05, -s * 0.16, s * 0.1, s * 0.32, s * 0.04);
      fillStroke(ctx, style.accent, outline * 1.2);
      ctx.restore();
      break;
    }

    case 'horn': {
      // Held two-handed and level, like an instrument rather than a weapon.
      arm(-1, reach * 0.62, shoulderY * 0.72);
      arm(1, reach * 0.62, shoulderY * 0.72);

      ctx.save();
      ctx.translate(reach * 0.62, 0);
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, -s * 0.07);
      ctx.lineTo(s * 0.24, -s * 0.21);
      ctx.lineTo(s * 0.24, s * 0.21);
      ctx.lineTo(-s * 0.08, s * 0.07);
      ctx.closePath();
      fillStroke(ctx, style.accent, outline * 1.5);
      ctx.beginPath();
      ctx.roundRect(-s * 0.18, -s * 0.06, s * 0.14, s * 0.12, s * 0.04);
      fillStroke(ctx, style.secondary, outline * 1.3);
      ctx.restore();
      break;
    }

    case 'cue': {
      // Two hands along a long pole: the longest weapon in the set, so the
      // silhouette is a line, which nothing else is.
      arm(-1, reach * 0.55, shoulderY * 0.6);
      arm(1, reach * 0.88, shoulderY * 0.5);

      ctx.save();
      ctx.translate(reach * 0.3, 0);
      ctx.beginPath();
      ctx.roundRect(-s * 0.05, -s * 0.045, s * 0.95, s * 0.09, s * 0.04);
      fillStroke(ctx, style.secondary, outline * 1.4);
      ctx.beginPath();
      ctx.roundRect(s * 0.78, -s * 0.05, s * 0.14, s * 0.1, s * 0.04);
      fillStroke(ctx, style.accent, outline * 1.2);
      ctx.restore();
      break;
    }

    case 'daggers': {
      // Held low and out to the sides, blades forward.
      for (const side of [-1, 1]) {
        arm(side, reach * 0.68, shoulderY * 0.95);
        ctx.save();
        ctx.translate(reach * 0.68, side * shoulderY * 0.95);
        ctx.rotate(side * 0.18);
        ctx.beginPath();
        ctx.moveTo(-s * 0.04, 0);
        ctx.quadraticCurveTo(s * 0.14, -side * s * 0.1, s * 0.34, 0);
        ctx.quadraticCurveTo(s * 0.14, -side * s * 0.03, -s * 0.04, 0);
        ctx.closePath();
        fillStroke(ctx, style.accent, outline * 1.2);
        ctx.restore();
      }
      break;
    }

    case 'hook': {
      arm(-1, reach * 0.5, shoulderY * 0.8);
      arm(1, reach * 0.38, shoulderY * 1.2);

      // A loop of chain in the trailing hand...
      ctx.save();
      ctx.translate(reach * 0.38, shoulderY * 1.2);
      ctx.lineWidth = outline * 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = outline * 0.8;
      ctx.strokeStyle = style.accent;
      ctx.stroke();
      ctx.restore();

      // ...and the hook itself leading in the other.
      ctx.save();
      ctx.translate(reach * 0.5, -shoulderY * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.3, 0);
      ctx.arc(s * 0.3, s * 0.1, s * 0.1, -Math.PI / 2, Math.PI * 0.7);
      ctx.lineWidth = outline * 2.2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = outline * 1.1;
      ctx.strokeStyle = style.accent;
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'frost': {
      // A staff topped with a faceted crystal.
      arm(-1, reach * 0.55, shoulderY * 0.7);
      arm(1, reach * 0.7, shoulderY * 0.6);

      ctx.save();
      ctx.translate(reach * 0.62, 0);
      ctx.beginPath();
      ctx.roundRect(-s * 0.1, -s * 0.04, s * 0.6, s * 0.08, s * 0.03);
      fillStroke(ctx, style.secondary, outline * 1.3);
      ctx.beginPath();
      ctx.moveTo(s * 0.5, 0);
      ctx.lineTo(s * 0.62, -s * 0.12);
      ctx.lineTo(s * 0.82, 0);
      ctx.lineTo(s * 0.62, s * 0.12);
      ctx.closePath();
      fillStroke(ctx, style.accent, outline * 1.5);
      ctx.restore();
      break;
    }

    case 'hammer': {
      // Carried over one shoulder, head out past the body so the silhouette
      // reads as heavy even before it swings.
      arm(-1, reach * 0.3, shoulderY * 1.25);
      arm(1, reach * 0.46, shoulderY * 1.0);

      ctx.save();
      ctx.translate(reach * 0.3, -shoulderY * 1.1);
      ctx.rotate(-0.95);
      ctx.beginPath();
      ctx.roundRect(-s * 0.05, -s * 0.05, s * 0.52, s * 0.1, s * 0.04);
      fillStroke(ctx, style.secondary, outline * 1.4);
      ctx.beginPath();
      ctx.roundRect(s * 0.4, -s * 0.2, s * 0.2, s * 0.4, s * 0.06);
      fillStroke(ctx, style.accent, outline * 1.6);
      ctx.restore();
      break;
    }

    case 'blades': {
      // Blades held in reverse grip, angled out from the hips.
      for (const side of [-1, 1]) {
        arm(side, reach * 0.6, shoulderY * 1.0);
        ctx.save();
        ctx.translate(reach * 0.6, side * shoulderY * 1.0);
        ctx.rotate(side * 0.5);
        ctx.beginPath();
        ctx.moveTo(-s * 0.06, 0);
        ctx.lineTo(s * 0.3, -s * 0.09);
        ctx.lineTo(s * 0.42, 0);
        ctx.lineTo(s * 0.3, s * 0.09);
        ctx.closePath();
        fillStroke(ctx, style.accent, outline * 1.3);
        ctx.restore();
      }
      break;
    }
  }
}

function drawHeadgear(
  ctx: CanvasRenderingContext2D,
  style: CharacterStyle,
  headX: number,
  headR: number,
  outline: number
): void {
  switch (style.headgear) {
    case 'hood': {
      // Hood opening: a ring of hair/fabric with the face left clear in front.
      ctx.beginPath();
      ctx.arc(headX, 0, headR * 1.08, Math.PI * 0.42, Math.PI * 1.58);
      ctx.lineWidth = headR * 0.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = style.hair;
      ctx.stroke();
      ctx.lineWidth = outline;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      break;
    }

    case 'cap': {
      ctx.beginPath();
      ctx.arc(headX, 0, headR * 0.92, -Math.PI * 0.62, Math.PI * 0.62);
      ctx.closePath();
      fillStroke(ctx, style.accent, outline * 1.4);
      // Brim.
      ctx.beginPath();
      ctx.ellipse(headX + headR * 0.72, 0, headR * 0.34, headR * 0.72, 0, 0, Math.PI * 2);
      fillStroke(ctx, style.secondary, outline * 1.2);
      break;
    }

    case 'mask': {
      ctx.beginPath();
      ctx.arc(headX + headR * 0.18, 0, headR * 0.82, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.closePath();
      fillStroke(ctx, style.accent, outline * 1.4);
      // Eye slit.
      ctx.beginPath();
      ctx.roundRect(headX + headR * 0.42, -headR * 0.46, headR * 0.3, headR * 0.92, headR * 0.14);
      fillStroke(ctx, '#0f1018', outline * 0.9);
      break;
    }

    case 'goggles': {
      ctx.beginPath();
      ctx.roundRect(headX + headR * 0.1, -headR * 0.88, headR * 0.5, headR * 1.76, headR * 0.2);
      fillStroke(ctx, style.secondary, outline * 1.3);
      for (const side of [-1, 1]) {
        ellipsePath(ctx, headX + headR * 0.36, side * headR * 0.46, headR * 0.2, headR * 0.26);
        fillStroke(ctx, style.accent, outline * 0.9);
      }
      break;
    }

    case 'crest': {
      // Spiky crest sweeping back from the crown.
      ctx.fillStyle = style.hair;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = outline;
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.42 + Math.PI;
        ctx.beginPath();
        ctx.moveTo(headX + Math.cos(a - 0.2) * headR * 0.9, Math.sin(a - 0.2) * headR * 0.9);
        ctx.lineTo(headX + Math.cos(a) * headR * 1.7, Math.sin(a) * headR * 1.7);
        ctx.lineTo(headX + Math.cos(a + 0.2) * headR * 0.9, Math.sin(a + 0.2) * headR * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }

    case 'visor': {
      // A welder's visor, flipped down over the face.
      ctx.beginPath();
      ctx.roundRect(headX - headR * 0.1, -headR * 0.95, headR * 1.25, headR * 1.9, headR * 0.3);
      fillStroke(ctx, style.secondary, outline * 1.4);
      // Slit, in the accent colour, so the face still has a focal point.
      ctx.beginPath();
      ctx.roundRect(headX + headR * 0.72, -headR * 0.5, headR * 0.3, headR, headR * 0.14);
      fillStroke(ctx, style.accent, outline);
      break;
    }

    case 'helm': {
      // Full helm with a raised comb along the crown.
      ctx.beginPath();
      ctx.arc(headX, 0, headR * 1.12, 0, Math.PI * 2);
      fillStroke(ctx, style.secondary, outline * 1.5);
      ctx.beginPath();
      ctx.roundRect(headX - headR * 0.2, -headR * 0.22, headR * 1.5, headR * 0.44, headR * 0.2);
      fillStroke(ctx, style.accent, outline * 1.2);

      ctx.fillStyle = style.accent;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = outline;
      ctx.beginPath();
      ctx.moveTo(headX - headR * 0.9, 0);
      ctx.lineTo(headX + headR * 0.3, -headR * 0.1);
      ctx.lineTo(headX + headR * 0.3, headR * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Pickups — also original, also drawn in code.
 * ------------------------------------------------------------------ */

/** Faceted gem with a highlight, sized by `radius`. */
export function drawGem(ctx: CanvasRenderingContext2D, radius: number, spin: number): void {
  ctx.save();
  ctx.rotate(spin);

  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(radius * 0.86, -radius * 0.28);
  ctx.lineTo(radius * 0.54, radius * 0.9);
  ctx.lineTo(-radius * 0.54, radius * 0.9);
  ctx.lineTo(-radius * 0.86, -radius * 0.28);
  ctx.closePath();
  fillStroke(ctx, '#a855f7', radius * 0.16);

  // Facet highlight.
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.82);
  ctx.lineTo(radius * 0.42, -radius * 0.1);
  ctx.lineTo(0, radius * 0.2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();

  ctx.restore();
}

/** Power cube: a chunky isometric-ish block with a glowing core. */
export function drawPowerCube(ctx: CanvasRenderingContext2D, radius: number, bob: number): void {
  ctx.save();
  ctx.translate(0, bob);

  ctx.beginPath();
  ctx.roundRect(-radius * 0.8, -radius * 0.8, radius * 1.6, radius * 1.6, radius * 0.26);
  fillStroke(ctx, '#16a34a', radius * 0.17);

  // Top bevel.
  ctx.beginPath();
  ctx.roundRect(-radius * 0.56, -radius * 0.62, radius * 1.12, radius * 0.5, radius * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  // Core.
  ctx.beginPath();
  ctx.arc(0, radius * 0.06, radius * 0.3, 0, Math.PI * 2);
  fillStroke(ctx, '#bbf7d0', radius * 0.12);

  ctx.restore();
}
