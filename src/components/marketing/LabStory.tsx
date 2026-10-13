'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The landing page's short comic: one morning in a materials lab, 15 s.
 *
 *  0-3s   The student comes in, drops the backpack on the stool by the bench,
 *         sits down and looks at everything there is to do.
 *  3-5s   Close-up on the monitor: Rune, "Yesterday's tasks", four left
 *         undone. The student sorts them into an order to work in.
 *  5-7s   9:00 AM. The professor - in a Newton-era horsehair wig - walks in
 *         and asks about yesterday's tasks. A moment's sweat; the plan is
 *         already on screen.
 *  7-11s  The work: weigh a powder for the synthesis, start the furnace,
 *         coffee, finish the script - each one ticked off on the dashboard.
 * 11-13s  Close-up again: the last task, the review paper, is read and ticked
 *         - "Done at 11:52 AM, before noon".
 * 13-15s  12:00. The professor comes back and finds it all done.
 *
 * One inline SVG in the Rune pen line, laid out in clear areas: the fume
 * hood and its robot (left), the argon cylinders feeding the tube furnace,
 * the bench with the furnace and balance, the desk with the monitor
 * (centre-right), the door (right); a periodic table and the clock on the
 * back wall. Every moving part
 * is a CSS keyframe on transform/opacity on a 15-second clock; the two
 * close-ups are one deliberate camera move each. Resting styles are the
 * final frame - everything done, the professor back - which is what reduced
 * motion shows. Paused off-screen, with a visible pause button.
 */

const T = 15;
const pct = (s: number, total = T) => `${+((s / total) * 100).toFixed(3)}%`;
type Frame = [number | number[], string];
function kf(name: string, frames: Frame[], total = T): string {
  return `@keyframes ls-${name}{${frames.map(([t, d]) => `${(Array.isArray(t) ? t : [t]).map((x) => pct(x, total)).join(',')}{${d}}`).join('')}}`;
}
function alternate(from: number, to: number, step: number, a: string, b: string): Frame[] {
  const out: Frame[] = [];
  let flip = false;
  for (let t = from; t < to - 1e-6; t += step) { out.push([+t.toFixed(3), flip ? b : a]); flip = !flip; }
  return out;
}
const rest = 'transform:none';
const on = 'opacity:1', off = 'opacity:0';
const between = (name: string, from: number, to: number) => kf(name, [[[0, from - 0.05], off], [[from, to], on], [[to + 0.05, T], off]]);

// Storyboard (seconds)
const S = {
  door1: 0.1, walk: [0.3, 1.9] as const, packOff: [1.95, 2.35] as const, sit: [2.0, 2.35] as const,
  lost: [2.4, 4.3] as const, zoom1: [3.0, 3.5, 4.9, 5.4] as const, sort: [4.0, 4.5] as const,
  door2: 5.2, sup1: [5.4, 6.2] as const, ask1: [6.2, 7.0] as const, supOut: [7.1, 7.9] as const,
  code: 7.0, synth: 7.2, weigh: [7.5, 8.2] as const, furnace: 8.5, coffee: 9.0, sip: [9.4, 10.0] as const, read: 10.4,
  zoom2: [11.0, 11.5, 12.8, 13.3] as const, tick: [8.3, 8.9, 10.3, 12.0] as const, allDone: 12.3,
  door3: 13.0, sup2: [13.2, 13.9] as const, ask2: 13.95, thumbs: 14.1, fade: [14.65, 14.95] as const,
};

// The monitor, and the Rune dashboard on its left half.
const SC = { x: 417, y: 155, w: 112, h: 72 };
const DASH_W = 70;
const ROW0 = SC.y + 26, ROW_H = 10;
// In the order they're worked through; yesterday's list had them the other way round.
const TASKS = ['Weigh 0.5 g precursor', 'Start furnace, 600 °C', 'Finish analysis script', 'Read the review paper'];
const YESTERDAY_ROW = [3, 2, 1, 0];
// The close-up: the screen's centre, scaled up in the middle of the 640x360 stage.
const ZOOM = 2.7;
const CAM_ZOOM = `transform:translate(${320 - ZOOM * (SC.x + SC.w / 2)}px,${180 - ZOOM * (SC.y + SC.h / 2)}px) scale(${ZOOM})`;

// Hood robot: a 32+32 arm on a base at (80,188) between the vial rack and
// the beaker, on its own unhurried 9-second cycle. Joint angles are solved
// for each pose with the elbow kept up, and the wrist always counters the
// other two joints so the vial hangs straight until it's deliberately
// tilted to pour.
const H = 9;
const HPOSE: Record<string, [number, number, number]> = {
  abovePick: [-8.3, -160.3, 168.6],
  pick: [-9.8, -187.5, 197.3],
  lift: [-10.4, -150.4, 160.8],
  transit: [-25.0, -40.0, 65.0],
  over: [13.9, -41.8, 27.8],
  pour: [13.9, -41.8, -27.2],
};
const HT: [number, keyof typeof HPOSE][] = [
  [0, 'abovePick'], [0.6, 'pick'], [0.9, 'pick'], [1.5, 'lift'], [2.5, 'transit'], [3.4, 'over'], [4.2, 'pour'], [5.2, 'pour'],
  [5.8, 'over'], [6.6, 'transit'], [7.5, 'lift'], [8.1, 'pick'], [8.4, 'pick'], [9, 'abovePick'],
];
const hk = (j: 0 | 1 | 2, name: string) => kf(name, HT.map(([t, p]) => [t, `transform:rotate(${HPOSE[p][j]}deg)`] as Frame), H);

const CSS = [
  `.ls .ls-a{animation-duration:${T}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.45,0,.25,1)}`,
  `.ls .ls-h{animation-duration:${H}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.45,0,.25,1)}`,
  `.ls-a,.ls-h{transform-box:view-box}`,
  `.ls[data-paused] .ls-a,.ls[data-paused] .ls-h,.ls[data-paused] .ls-stir,.ls[data-paused] .ls-hvap{animation-play-state:paused}`,
  `@media (prefers-reduced-motion:reduce){.ls .ls-a,.ls .ls-h,.ls .ls-stir,.ls .ls-hvap{animation:none!important}.ls .ls-pause{display:none}}`,

  // ---- camera: two deliberate close-ups on the dashboard
  `.ls-cam{transform-origin:0 0;animation-name:ls-cam;animation-timing-function:cubic-bezier(.6,0,.2,1)}`,
  kf('cam', [[[0, S.zoom1[0]], rest], [[S.zoom1[1], S.zoom1[2]], CAM_ZOOM], [[S.zoom1[3], S.zoom2[0]], rest], [[S.zoom2[1], S.zoom2[2]], CAM_ZOOM], [[S.zoom2[3], T], rest]]),

  `.ls-cast{animation-name:ls-cast}`,
  kf('cast', [[[0, S.fade[0]], on], [[S.fade[1], T], off]]),

  // ---- the student: door -> desk at a steady pace, backpack onto the stool, sit
  `.ls-stu{animation-name:ls-stu;animation-timing-function:linear}`,
  kf('stu', [[[0, S.walk[0] - 0.15], 'opacity:0;transform:translate(213px,-52px)'], [[S.walk[0] - 0.05, S.walk[0]], 'opacity:1;transform:translate(213px,-52px)'], [[S.walk[1], T], 'opacity:1;transform:none']]),
  `.ls-sit{transform:translateY(2px);animation-name:ls-sit}`,
  kf('sit', [[[0, S.sit[0]], rest], [[S.sit[1], T], 'transform:translateY(2px)']]),
  `.ls-bob{animation-name:ls-bob;animation-timing-function:ease-in-out}`,
  kf('bob', [[[0, S.walk[0]], rest], ...alternate(S.walk[0], S.walk[1], 0.26, 'transform:translateY(-.6px)', rest), [[S.walk[1], T], rest]]),
  `.ls-leg-l{transform-origin:22.3px 31.2px;animation-name:ls-leg-l;animation-timing-function:ease-in-out}.ls-leg-r{transform-origin:25.7px 31.2px;animation-name:ls-leg-r;animation-timing-function:ease-in-out}`,
  kf('leg-l', [[[0, S.walk[0]], rest], ...alternate(S.walk[0], S.walk[1], 0.26, 'transform:rotate(-15deg)', 'transform:rotate(13deg)'), [[S.walk[1] + 0.1, T], rest]]),
  kf('leg-r', [[[0, S.walk[0]], rest], ...alternate(S.walk[0], S.walk[1], 0.26, 'transform:rotate(13deg)', 'transform:rotate(-15deg)'), [[S.walk[1] + 0.1, T], rest]]),
  `.ls-warm{opacity:0;animation-name:ls-warm}`,
  kf('warm', [[[0, S.packOff[0]], on], [[S.packOff[0] + 0.1, T], off]]),
  `.ls-swing-l{transform-origin:19.4px 22.2px;animation-name:ls-swing-l}.ls-swing-r{transform-origin:28.6px 22.2px;animation-name:ls-swing-r}`,
  kf('swing-l', [[[0, S.walk[0]], rest], ...alternate(S.walk[0], S.walk[1], 0.26, 'transform:rotate(12deg)', 'transform:rotate(-10deg)'), [[S.walk[1] + 0.1, T], rest]]),
  kf('swing-r', [[[0, S.walk[0]], rest], ...alternate(S.walk[0], S.walk[1], 0.26, 'transform:rotate(-10deg)', 'transform:rotate(12deg)'), [[S.walk[1] + 0.1, T], rest]]),
  `.ls-pack-on{opacity:0;animation-name:ls-pack-on}`,
  kf('pack-on', [[[0, S.packOff[0]], on], [[S.packOff[0] + 0.05, T], off]]),
  `.ls-pack-off{animation-name:ls-pack-off}`,
  kf('pack-off', [[[0, S.packOff[0]], 'opacity:0;transform:translate(37px,-37px)'], [S.packOff[0] + 0.05, 'opacity:1;transform:translate(37px,-37px) rotate(-8deg)'], [S.packOff[0] + 0.25, 'opacity:1;transform:translate(14px,-22px) rotate(-14deg)'], [[S.packOff[1], S.fade[0]], 'opacity:1;transform:none'], [[S.fade[1], T], 'opacity:0;transform:none']]),

  // ---- hands on the keyboard: sorting the list, then writing code
  `.ls-hands{animation-name:ls-hands}`,
  kf('hands', [[[0, S.packOff[0] + 0.1], off], [[S.sit[0], T], on]]),
  `.ls-type-l,.ls-type-r{animation-timing-function:steps(1,end)}.ls-type-l{animation-name:ls-type-l}.ls-type-r{animation-name:ls-type-r}`,
  kf('type-l', [[0, rest], ...alternate(S.sort[0] - 0.4, S.sort[1], 0.16, 'transform:translateY(-.5px)', rest), ...alternate(S.code, 10.2, 0.17, 'transform:translateY(-.5px)', rest), [[10.2, T], rest]]),
  kf('type-r', [[0, rest], ...alternate(S.code + 0.08, 10.2, 0.19, rest, 'transform:translateY(-.5px)'), [[10.2, T], rest]]),
  `.ls-hand-r{animation-name:ls-hand-r}.ls-scratch{opacity:0;animation-name:ls-scratch;animation-timing-function:ease-in-out}`,
  kf('hand-r', [[[0, 2.5], on], [[2.55, 3.05], off], [[3.1, T], on]]),
  kf('scratch', [[[0, 2.5], 'opacity:0;transform:none'], [2.55, 'opacity:1;transform:none'], ...alternate(2.65, 3.0, 0.12, 'opacity:1;transform:translateY(-.5px)', 'opacity:1;transform:none'), [[3.05, T], 'opacity:0;transform:none']]),
  `.ls-q{opacity:0;transform-box:fill-box;transform-origin:50% 100%;animation-name:ls-q}.ls-q2{animation-delay:-.25s}`,
  kf('q', [[[0, S.lost[0]], 'opacity:0;transform:translateY(4px) scale(.6)'], [S.lost[0] + 0.35, 'opacity:1;transform:none'], [S.lost[1] - 0.3, 'opacity:1;transform:translateY(-2px)'], [[S.lost[1], T], 'opacity:0;transform:translateY(-4px)']]),

  // ---- the dashboard: yesterday's list, sorted, then ticked off
  ...TASKS.map((_, k) => {
    const dy = (YESTERDAY_ROW[k] - k) * ROW_H;
    // The old order fades out, then the sorted list fades in row by row -
    // nothing slides through anything else.
    const back = S.sort[0] + 0.2 + k * 0.08;
    return `.ls-row-${k}{animation-name:ls-row-${k}}` + kf(`row-${k}`, [
      [[0, S.sort[0]], `opacity:1;transform:translateY(${dy}px)`],
      [S.sort[0] + 0.15, `opacity:0;transform:translateY(${dy}px)`],
      [S.sort[0] + 0.16, 'opacity:0;transform:translateX(-3px)'],
      [[back + 0.18, T], 'opacity:1;transform:none'],
    ]);
  }),
  `.ls-prio{animation-name:ls-prio}`,
  kf('prio', [[[0, S.sort[1]], off], [[S.sort[1] + 0.3, S.fade[0]], on], [[S.fade[1], T], off]]),
  ...S.tick.map((t, k) =>
    `.ls-tick-${k}{transform-box:fill-box;transform-origin:50% 50%;animation-name:ls-tick-${k}}` + kf(`tick-${k}`, [[[0, t], 'opacity:0;transform:scale(.4)'], [[t + 0.2, S.fade[0]], 'opacity:1;transform:none'], [[S.fade[1], T], off]]) +
    `.ls-done-${k}{opacity:.5;animation-name:ls-done-${k}}` + kf(`done-${k}`, [[[0, t], on], [[t + 0.25, S.fade[0]], 'opacity:.5'], [[S.fade[1], T], on]]) +
    `.ls-strike-${k}{transform-box:fill-box;transform-origin:0 50%;animation-name:ls-strike-${k}}` + kf(`strike-${k}`, [[[0, t + 0.05], 'transform:scaleX(0)'], [[t + 0.35, S.fade[0]], rest], [[S.fade[1], T], 'transform:scaleX(0)']])),
  `.ls-open{opacity:0;animation-name:ls-open}.ls-alldone{animation-name:ls-alldone}`,
  kf('open', [[[0, S.allDone - 0.05], on], [[S.allDone + 0.1, T], off]]),
  kf('alldone', [[[0, S.allDone], 'opacity:0;transform:translateY(2px)'], [[S.allDone + 0.3, S.fade[0]], 'opacity:1;transform:none'], [[S.fade[1], T], off]]),

  // ---- extra hand #1: weighing a powder for the synthesis, then a thumbs-up
  `.ls-synth{opacity:0;transform-origin:20.5px 24.5px;animation-name:ls-synth}`,
  kf('synth', [[[0, S.synth - 0.05], 'opacity:0;transform:rotate(40deg) scale(.4)'], [[S.synth + 0.3, S.weigh[1] + 0.15], 'opacity:1;transform:none'], [[S.weigh[1] + 0.5, T], 'opacity:0;transform:rotate(30deg) scale(.5)']]),
  `.ls-spatula{transform-origin:6px 10.3px;animation-name:ls-spatula;animation-timing-function:ease-in-out}`,
  kf('spatula', [[0, rest], ...alternate(S.weigh[0], S.weigh[1], 0.2, 'transform:rotate(-12deg)', rest), [[S.weigh[1], T], rest]]),
  `.ls-powder{opacity:0;animation-name:ls-powder;animation-timing-function:ease-in}`,
  kf('powder', [[0, 'opacity:0;transform:none'], ...[0, 1, 2].flatMap((i) => {
    const t = S.weigh[0] + i * 0.22;
    return [[t, 'opacity:1;transform:none'] as Frame, [t + 0.16, 'opacity:1;transform:translateY(8px)'] as Frame, [t + 0.2, 'opacity:0;transform:none'] as Frame];
  }), [T, 'opacity:0;transform:none']]),
  `.ls-heap{transform-box:fill-box;transform-origin:50% 100%;animation-name:ls-heap}`,
  kf('heap', [[[0, S.weigh[0] + 0.15], 'transform:scale(0)'], [[S.weigh[1], S.fade[1]], rest], [[S.fade[1] + 0.02, T], 'transform:scale(0)']]),
  `.ls-mass0{opacity:0;animation-name:ls-mass0}.ls-mass1{opacity:0;animation-name:ls-mass1}.ls-mass2{animation-name:ls-mass2}`,
  kf('mass0', [[[0, S.weigh[0] + 0.25], on], [[S.weigh[0] + 0.3, S.fade[1]], off], [[S.fade[1] + 0.02, T], on]]),
  between('mass1', S.weigh[0] + 0.3, S.weigh[0] + 0.6),
  kf('mass2', [[[0, S.weigh[0] + 0.6], off], [[S.weigh[0] + 0.65, S.fade[1]], on], [[S.fade[1] + 0.02, T], off]]),
  // tube furnace: switched on, heats up
  `.ls-glow{opacity:.75;animation-name:ls-glow}`,
  kf('glow', [[[0, S.furnace], 'opacity:0'], [S.furnace + 1.2, 'opacity:.9'], [[S.furnace + 1.4, S.fade[0]], 'opacity:.75'], [[S.fade[1], T], 'opacity:0']]),
  `.ls-temp0{opacity:0;animation-name:ls-temp0}.ls-temp1{opacity:0;animation-name:ls-temp1}.ls-temp2{animation-name:ls-temp2}`,
  kf('temp0', [[[0, S.furnace + 0.3], on], [[S.furnace + 0.35, S.fade[1]], off], [[S.fade[1] + 0.02, T], on]]),
  between('temp1', S.furnace + 0.35, S.furnace + 1.0),
  kf('temp2', [[[0, S.furnace + 1.0], off], [[S.furnace + 1.05, S.fade[1]], on], [[S.fade[1] + 0.02, T], off]]),

  // ---- extra hand #2: the coffee (one long sip, eyes closed)
  `.ls-cup-arm{transform-origin:27.5px 24.5px;animation-name:ls-cup-arm}`,
  kf('cup-arm', [[[0, S.coffee - 0.05], 'opacity:0;transform:rotate(-40deg) scale(.4)'], [[S.coffee + 0.3, T], 'opacity:1;transform:none']]),
  `.ls-mug{transform-origin:37px 18.3px;animation-name:ls-mug}`,
  kf('mug', [[[0, S.sip[0], S.sip[1], T], rest], [[S.sip[0] + 0.2, S.sip[1] - 0.2], 'transform:translate(-9.6px,-2px) rotate(-22deg)']]),
  `.ls-cup-rest{animation-name:ls-cup-rest}.ls-cup-sip{opacity:0;animation-name:ls-cup-sip}`,
  kf('cup-rest', [[[0, S.sip[0] + 0.08, S.sip[1] - 0.1, T], on], [[S.sip[0] + 0.15, S.sip[1] - 0.17], off]]),
  kf('cup-sip', [[[0, S.sip[0] + 0.08, S.sip[1] - 0.1, T], off], [[S.sip[0] + 0.15, S.sip[1] - 0.17], on]]),
  `.ls-steam{animation-name:ls-steam;animation-timing-function:ease-in-out}`,
  kf('steam', [[0, 'opacity:0;transform:none'], ...[0, 1.6, 3.2].flatMap((d) => [
    [S.coffee + 0.5 + d, 'opacity:0;transform:none'] as Frame, [S.coffee + 1.0 + d, 'opacity:.7;transform:translateY(-.4px)'] as Frame, [S.coffee + 1.6 + d, 'opacity:0;transform:translateY(-1.2px)'] as Frame,
  ]), [T, 'opacity:0;transform:none']]),
  // ---- extra hand #3: the review paper, read through to the last page
  `.ls-paper{transform-origin:20.5px 25px;animation-name:ls-paper}`,
  kf('paper', [[[0, S.read - 0.05], 'opacity:0;transform:rotate(30deg) scale(.4)'], [[S.read + 0.3, T], 'opacity:1;transform:none']]),
  `.ls-page{transform-box:fill-box;transform-origin:0 50%;animation-name:ls-page}`,
  kf('page', [[[0, 11.4], rest], [11.6, 'transform:scaleX(.15)'], [[11.8, T], rest]]),
  `.ls-thumb{transform-origin:19.4px 22.2px;animation-name:ls-thumb}.ls-hand-l{animation-name:ls-hand-l}`,
  kf('hand-l', [[[0, S.thumbs - 0.05], on], [[S.thumbs, T], off]]),
  kf('thumb', [[[0, S.thumbs - 0.05], 'opacity:0;transform:rotate(30deg) scale(.6)'], [[S.thumbs + 0.3, T], 'opacity:1;transform:none']]),

  // ---- face
  `.ls-gaze{transform:translate(.9px,-.4px);animation-name:ls-gaze}`,
  kf('gaze', [
    [[0, S.walk[0]], rest], [[S.walk[0] + 0.15, S.walk[1]], 'transform:translate(-.9px,0)'], [[S.sit[1], 2.6], 'transform:translate(-1px,-.6px)'],
    [[2.75, 2.95], 'transform:translate(1.1px,-.5px)'], [[3.1, 5.4], 'transform:translate(1.1px,.2px)'], [[5.6, S.ask1[1]], 'transform:translate(.9px,-.4px)'],
    [[7.15, S.synth], 'transform:translate(1px,.3px)'], [[S.synth + 0.2, S.weigh[1]], 'transform:translate(-1.1px,.6px)'],
    [[S.weigh[1] + 0.15, S.furnace + 0.4], 'transform:translate(-1.1px,.3px)'], [[S.furnace + 0.6, S.read], 'transform:translate(1px,.3px)'],
    [[S.read + 0.2, 11.9], 'transform:translate(-1.1px,.6px)'], [[12.05, 13.1], 'transform:translate(1.1px,.2px)'], [[13.3, T], 'transform:translate(.9px,-.4px)'],
  ]),
  `.ls-blink{transform-origin:24px 11.4px;animation-name:ls-blink}`,
  kf('blink', [
    [[0, 1.0, 1.2, S.sip[0] + 0.2, S.sip[1] - 0.2, 8.0, 8.2, T], rest],
    [[1.1, 8.1], 'transform:scaleY(.12)'], [[S.sip[0] + 0.3, S.sip[1] - 0.3], 'transform:scaleY(.12)'],
  ]),
  `.ls-smile{opacity:0;animation-name:ls-smile}.ls-grin{animation-name:ls-grin}.ls-hmm{opacity:0;animation-name:ls-hmm}`,
  kf('smile', [[[0, S.lost[0]], on], [[S.lost[0] + 0.05, S.lost[1]], off], [[S.lost[1] + 0.05, S.thumbs], on], [[S.thumbs + 0.05, T], off]]),
  between('hmm', S.lost[0] + 0.05, S.lost[1]),
  kf('grin', [[[0, S.thumbs], off], [[S.thumbs + 0.05, T], on]]),
  `.ls-det{opacity:0;animation-name:ls-det}`,
  kf('det', [[[0, S.code - 0.1], 'opacity:0;transform:translateY(.4px)'], [[S.code + 0.2, S.thumbs - 0.1], 'opacity:1;transform:none'], [[S.thumbs + 0.1, T], off]]),
  `.ls-sweat{opacity:0;animation-name:ls-sweat}`,
  kf('sweat', [[[0, S.ask1[0] + 0.1], 'opacity:0;transform:none'], [S.ask1[0] + 0.35, 'opacity:1;transform:none'], [[S.ask1[1] + 0.3, T], 'opacity:0;transform:translateY(1.6px)']]),

  // ---- the code pane: the analysis script types in
  ...[0, 1, 2, 3, 4, 5].map((i) =>
    `.ls-line-${i}{transform:translateX(44px);animation-name:ls-line-${i};animation-timing-function:steps(8,end)}` +
    kf(`line-${i}`, [[[0, S.code + 0.2 + i * 0.5], rest], [[S.code + 0.6 + i * 0.5, S.fade[0]], 'transform:translateX(44px)'], [[S.fade[1], T], rest]])),
  `.ls-caret{animation-name:ls-caret;animation-timing-function:steps(1,end)}`,
  kf('caret', [[[0, 10.15], off], ...alternate(10.2, S.fade[0], 0.5, on, off), [[S.fade[0], T], off]]),

  // ---- the hood robot, on its own loop: pick, pour, put back
  `.ls-hj1{transform-origin:80px 188px;animation-name:ls-hj1}.ls-hj2{transform-origin:80px 156px;animation-name:ls-hj2}.ls-hj3{transform-origin:112px 156px;animation-name:ls-hj3}`,
  hk(0, 'hj1'), hk(1, 'hj2'), hk(2, 'hj3'),
  `.ls-hgrip{transform-origin:112px 160px;animation-name:ls-hgrip}`,
  kf('hgrip', [[[0, 0.65], rest], [[0.85, 8.2], 'transform:scaleX(.65)'], [[8.4, H], rest]], H),
  `.ls-hvial-rack{animation-name:ls-hvial-rack}.ls-hvial-held{opacity:0;animation-name:ls-hvial-held}`,
  kf('hvial-rack', [[[0, 0.8], on], [[0.85, 8.25], off], [[8.3, H], on]], H),
  kf('hvial-held', [[[0, 0.8], off], [[0.85, 8.25], on], [[8.3, H], off]], H),
  `.ls-hstream{opacity:0;animation-name:ls-hstream;animation-timing-function:linear}`,
  kf('hstream', [[[0, 4.25], 'opacity:0;stroke-dashoffset:0'], [4.4, 'opacity:1;stroke-dashoffset:-2'], [5.1, 'opacity:1;stroke-dashoffset:-22'], [[5.25, H], 'opacity:0;stroke-dashoffset:-24']], H),
  `.ls-stir{transform-box:view-box;transform-origin:116px 185px;animation:ls-stir .7s linear infinite}`,
  `@keyframes ls-stir{0%,100%{transform:scaleX(1)}50%{transform:scaleX(-1)}}`,
  `.ls-hvap{opacity:0;transform-box:view-box;animation:ls-hvap 3.2s ease-in infinite}.ls-hvap2{animation-delay:-1.6s}`,
  `@keyframes ls-hvap{0%{opacity:0;transform:none}25%{opacity:.6}100%{opacity:0;transform:translateY(-58px)}}`,

  // ---- the wall clock: 8:52, 9:00 as the professor arrives, the morning, 12:00
  `.ls-hour{transform-origin:360px 72px;transform:rotate(360deg);animation-name:ls-hour;animation-timing-function:linear}.ls-min{transform-origin:360px 72px;transform:rotate(1440deg);animation-name:ls-min;animation-timing-function:linear}`,
  kf('hour', [[[0, 4.6], 'transform:rotate(266deg)'], [[5.4, 7.2], 'transform:rotate(270deg)'], [S.allDone, 'transform:rotate(356deg)'], [[S.sup2[0], S.fade[1]], 'transform:rotate(360deg)'], [T, 'transform:rotate(266deg)']]),
  kf('min', [[[0, 4.6], 'transform:rotate(312deg)'], [[5.4, 7.2], 'transform:rotate(360deg)'], [S.allDone, 'transform:rotate(1392deg)'], [[S.sup2[0], S.fade[1]], 'transform:rotate(1440deg)'], [T, 'transform:rotate(312deg)']]),
  `.ls-hands-clock{animation-name:ls-hands-clock}`,
  kf('hands-clock', [[[0, S.fade[0]], on], [[S.fade[0] + 0.15, T - 0.03], off], [T, on]]),
  `.ls-t9{opacity:0;animation-name:ls-t9}.ls-t12{animation-name:ls-t12}`,
  between('t9', 5.0, 8.0),
  kf('t12', [[[0, S.door3], off], [[S.door3 + 0.1, S.fade[0]], on], [[S.fade[0] + 0.15, T], off]]),

  // ---- door and professor: in at 9, out again, back at noon
  `.ls-door{transform-origin:623px 0;transform:scaleX(.14);animation-name:ls-door}`,
  kf('door', [[[0, S.door1], rest], [[S.door1 + 0.3, S.walk[0] + 1.0], 'transform:scaleX(.14)'], [[S.walk[0] + 1.5, S.door2], rest],
    [[S.door2 + 0.3, S.supOut[1] + 0.1], 'transform:scaleX(.14)'], [[S.supOut[1] + 0.5, S.door3], rest], [[S.door3 + 0.3, S.fade[1]], 'transform:scaleX(.14)'], [[S.fade[1] + 0.03, T], rest]]),
  `.ls-sup{animation-name:ls-sup}`,
  kf('sup', [
    [[0, S.sup1[0] - 0.05], 'opacity:0;transform:translate(17px,-52px)'], [S.sup1[0], 'opacity:1;transform:translate(17px,-52px)'], [[S.sup1[1], S.supOut[0]], 'opacity:1;transform:none'],
    [S.supOut[1], 'opacity:1;transform:translate(17px,-52px)'], [[S.supOut[1] + 0.05, S.sup2[0] - 0.05], 'opacity:0;transform:translate(17px,-52px)'],
    [S.sup2[0], 'opacity:1;transform:translate(17px,-52px)'], [[S.sup2[1], T], 'opacity:1;transform:none'],
  ]),
  `.ls-sleg-l{transform-origin:22.4px 36.2px;animation-name:ls-sleg-l;animation-timing-function:ease-in-out}.ls-sleg-r{transform-origin:25.6px 36.2px;animation-name:ls-sleg-r;animation-timing-function:ease-in-out}`,
  kf('sleg-l', [[[0, S.sup1[0]], rest], ...alternate(S.sup1[0], S.sup1[1], 0.2, 'transform:rotate(-11deg)', 'transform:rotate(9deg)'), [[S.sup1[1] + 0.05, S.supOut[0]], rest], ...alternate(S.supOut[0], S.supOut[1], 0.2, 'transform:rotate(9deg)', 'transform:rotate(-11deg)'), [[S.supOut[1] + 0.05, S.sup2[0]], rest], ...alternate(S.sup2[0], S.sup2[1], 0.2, 'transform:rotate(-11deg)', 'transform:rotate(9deg)'), [[S.sup2[1] + 0.05, T], rest]]),
  kf('sleg-r', [[[0, S.sup1[0]], rest], ...alternate(S.sup1[0], S.sup1[1], 0.2, 'transform:rotate(9deg)', 'transform:rotate(-11deg)'), [[S.sup1[1] + 0.05, S.supOut[0]], rest], ...alternate(S.supOut[0], S.supOut[1], 0.2, 'transform:rotate(-11deg)', 'transform:rotate(9deg)'), [[S.supOut[1] + 0.05, S.sup2[0]], rest], ...alternate(S.sup2[0], S.sup2[1], 0.2, 'transform:rotate(9deg)', 'transform:rotate(-11deg)'), [[S.sup2[1] + 0.05, T], rest]]),
  `.ls-brows{transform:translateY(-.9px);animation-name:ls-brows}`,
  kf('brows', [[[0, S.ask1[0]], rest], [[S.ask1[0] + 0.2, S.ask1[1]], 'transform:translateY(.3px)'], [[S.ask1[1] + 0.2, S.ask2], rest], [[S.ask2 + 0.2, T], 'transform:translateY(-.9px)']]),
  `.ls-say1{opacity:0;transform-box:fill-box;transform-origin:85% 100%;animation-name:ls-say1}`,
  kf('say1', [[[0, S.ask1[0]], 'opacity:0;transform:scale(.85)'], [[S.ask1[0] + 0.2, S.ask1[1]], 'opacity:1;transform:none'], [[S.ask1[1] + 0.15, T], 'opacity:0;transform:none']]),
  `.ls-say2{transform-box:fill-box;transform-origin:85% 100%;animation-name:ls-say2}`,
  kf('say2', [[[0, S.ask2], 'opacity:0;transform:scale(.85)'], [[S.ask2 + 0.2, S.fade[0]], 'opacity:1;transform:none'], [[S.fade[1], T], 'opacity:0;transform:none']]),
].join('\n');

export function LabStory() {
  const ref = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <figure ref={ref} className="ls relative" data-paused={userPaused || offscreen ? '' : undefined}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="relative overflow-hidden rounded-[18px] border border-border bg-surface [--ls-bg:var(--surface)]">
        <Scene />
        <button
          type="button"
          onClick={() => setUserPaused((p) => !p)}
          className="ls-pause absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-ink-secondary transition-colors hover:border-border-strong hover:text-foreground"
          aria-label={userPaused ? 'Play the animation' : 'Pause the animation'}
          aria-pressed={userPaused}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
            {userPaused ? <path d="M5 3.5v9l7-4.5z" /> : <path d="M4.5 3.5h2.4v9H4.5zM9.1 3.5h2.4v9H9.1z" />}
          </svg>
        </button>
      </div>
    </figure>
  );
}

/* --------------------------------------------------------------- drawing */

const BG = 'var(--ls-bg)';
const FAINT = 'var(--text-faint)';
const MONO = 'var(--font-mono), ui-monospace, monospace';

type Tok = [string, 'kw' | 'fn' | 'com' | 'tx'];
const CODE: Tok[][] = [
  [['# analyse the film', 'com']],
  [['def ', 'kw'], ['run_experiment', 'fn'], ['():', 'tx']],
  [['  sample = ', 'tx'], ['prepare_sample', 'fn'], ['()', 'tx']],
  [['  result = ', 'tx'], ['analyse', 'fn'], ['(sample)', 'tx']],
  [['  return ', 'kw'], ['result', 'tx']],
  [['run_experiment', 'fn'], ['()', 'tx']],
];
const TOK: Record<Tok[1], string> = { kw: '#7cc9a2', fn: '#e2c47e', com: '#7b857e', tx: '#d9d7cd' };

function Scene() {
  return (
    <svg
      viewBox="0 0 640 360"
      className="block h-auto w-full text-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="A 15-second comic of one morning in a materials lab. A student comes in, drops their backpack on a stool and sits down at their desk, unsure where to start. Their monitor shows Rune with yesterday's unfinished tasks, which they sort into an order. At 9:00 AM their professor, wearing an old-fashioned powdered wig, walks in and asks about yesterday's tasks; the student sweats for a moment, then gets to work - weighing a powder, starting the furnace, a sip of coffee, writing code, reading a paper - ticking each task off on the dashboard. At 11:52 everything is done. At noon the professor comes back, surprised to find it all finished, and the student gives a thumbs-up."
    >
      <defs>
        <clipPath id="ls-code"><rect x={SC.x + DASH_W + 2} y={SC.y} width={SC.w - DASH_W - 2} height={SC.h} rx="2" /></clipPath>
      </defs>

      <g className="ls-a ls-cam">
        {/* ---------- the room: back wall, floor, a clock, the door */}
        <g stroke={FAINT} strokeWidth={1}>
          <path d="M0 248h640" />
          <circle cx="360" cy="72" r="16" />
          <circle cx="360" cy="72" r="13.6" opacity=".5" />
          <path d="M360 60.5v2.2M371.5 72h-2.2M360 83.5v-2.2M348.5 72h2.2" />
          <rect x="571" y="107" width="52" height="141" fill="color-mix(in srgb, var(--text) 7%, var(--ls-bg))" stroke="none" />
          <path d="M568 248V104h58v144" />
        </g>
        <g className="ls-a ls-hands-clock" stroke={FAINT} strokeWidth={1.5}>
          <path className="ls-a ls-hour" d="M360 72v-7" />
          <path className="ls-a ls-min" d="M360 72v-10.5" />
        </g>
        <circle cx="360" cy="72" r="1.3" fill={FAINT} stroke="none" />
        <g fill={FAINT} stroke="none" fontSize="10" fontFamily={MONO} textAnchor="middle">
          <text className="ls-a ls-t9" x="360" y="104">9:00 AM</text>
          <text className="ls-a ls-t12" x="360" y="104" fill="var(--primary)">12:00 PM</text>
        </g>

        <PeriodicTable />
        <GasCylinders />

        {/* ---------- the experiment area */}
        <FumeHood />

        {/* ---------- people, behind the bench they work at */}
        <g className="ls-a ls-cast">
          <Supervisor />
          <Chair />
          <Student />
        </g>

        {/* door panel over the doorway */}
        <g className="ls-a ls-door" stroke={FAINT} strokeWidth={1}>
          <rect x="571" y="107" width="52" height="141" fill={BG} />
          <rect x="581" y="122" width="32" height="30" rx="1.5" />
          <path d="M586 148l9-20M594 148l12-20" opacity=".5" />
          <path d="M579 182v8" />
        </g>

        <Bench />

        {/* the stool by the bench, and the backpack once it's off */}
        <g stroke={FAINT} strokeWidth={1}>
          <path d="M327 306h36M331 306l-2 14M359 306l2 14" />
        </g>
        <g className="ls-a ls-cast">
          <g className="ls-a ls-pack-off">
            <path d="M336 304v-17a7 7 0 0 1 7-7h6a7 7 0 0 1 7 7v17z" fill={BG} />
            <path d="M339 294h14v10M342 280c0-4 8-4 8 0" strokeWidth={1} />
          </g>
        </g>

        {/* the professor's two questions */}
        <Bubble className="ls-a ls-say1" text="Yesterday’s tasks…?" />
        <Bubble className="ls-a ls-say2" text="All done? Before noon!" />
      </g>
    </svg>
  );
}

/** The professor's speech bubble, tail towards where they stand. */
function Bubble({ className, text }: { className: string; text: string }) {
  return (
    <g className={className}>
      <path d="M454 100h136a14 14 0 0 1 14 14v8a14 14 0 0 1-14 14h-14l-2 16-12-16h-108a14 14 0 0 1-14-14v-8a14 14 0 0 1 14-14z" fill={BG} strokeWidth={1.1} />
      <text x="522" y="122.5" textAnchor="middle" fill="currentColor" stroke="none" className="font-sans" fontSize="14.5" fontWeight={500}>{text}</text>
    </g>
  );
}

/** Floor-standing fume hood against the back wall, with its own robot arm working inside. */
function FumeHood() {
  return (
    <g>
      <path d="M62 0v56M96 0v56" stroke={FAINT} strokeWidth={1} />
      <path className="ls-hvap" d="M112 156c-3-5 3-8 0-13s3-8 0-13" stroke={FAINT} strokeWidth={1} />
      <path className="ls-hvap ls-hvap2" d="M120 158c-3-5 3-8 0-13s3-8 0-13" stroke={FAINT} strokeWidth={1} />
      <rect x="14" y="56" width="136" height="16" rx="2" fill={BG} />
      <rect x="18" y="72" width="128" height="124" fill="color-mix(in srgb, var(--text) 4%, var(--ls-bg))" />

      {/* stirring hot plate with a beaker */}
      <path d="M100 196v-8h32v8" fill={BG} />
      <circle cx="106" cy="192" r="1.2" fill="var(--primary)" stroke="none" />
      <path d="M104 164v20a4 4 0 0 0 4 4h16a4 4 0 0 0 4-4v-20M102 164h28" fill={BG} />
      <path d="M105 172h22v12a3 3 0 0 1-3 3h-16a3 3 0 0 1-3-3z" fill="var(--primary)" fillOpacity=".55" stroke="none" />
      <rect className="ls-stir" x="111" y="183.4" width="10" height="2.4" rx="1.2" fill="currentColor" stroke="none" />
      <path className="ls-h ls-hstream" d="M116 149v16" stroke="var(--primary)" strokeWidth={1.6} strokeDasharray="3 2.5" />

      {/* vial rack */}
      <rect x="33" y="172" width="6" height="16" rx="2.4" fill={BG} />
      <g className="ls-h ls-hvial-rack"><rect x="41" y="172" width="6" height="16" rx="2.4" fill={BG} /><rect x="42" y="179" width="4" height="8" rx="1.5" fill="var(--primary)" stroke="none" /></g>
      <rect x="49" y="172" width="6" height="16" rx="2.4" fill={BG} />
      <path d="M29 182h30v14H29z" fill={BG} />

      {/* robot arm (32+32, base at 80,188) */}
      <path d="M70 196l3-6h14l3 6z" fill={BG} />
      <g className="ls-h ls-hj1">
        <path d="M77.5 188v-32M82.5 188v-32" />
        <g className="ls-h ls-hj2">
          <path d="M80 153.5h32M80 158.5h32" />
          <g className="ls-h ls-hj3">
            <path d="M112 158v2" />
            <g className="ls-h ls-hgrip"><path d="M109 160v6M115 160v6M109 160h6" /></g>
            <g className="ls-h ls-hvial-held"><rect x="109" y="162" width="6" height="16" rx="2.4" fill={BG} /><rect x="110" y="169" width="4" height="8" rx="1.5" fill="var(--primary)" stroke="none" /></g>
            <circle cx="112" cy="156" r="3.2" fill={BG} />
          </g>
          <circle cx="80" cy="156" r="3.8" fill={BG} />
        </g>
        <circle cx="80" cy="188" r="4.6" fill={BG} />
      </g>

      {/* sash glass (raised to here), frame, work surface, base cabinet */}
      <path d="M28 92l18-14M32 108l26-20M120 118l16-12" stroke={FAINT} strokeWidth={1} opacity=".6" />
      <path d="M18 72v124M146 72v124M20 126h124M20 130h124" />
      <path d="M14 196h136" strokeWidth={1.6} />
      <rect x="16" y="198" width="132" height="50" fill={BG} />
      <path d="M82 198v50M74 220v8M90 220v8" stroke={FAINT} />
    </g>
  );
}

/**
 * A periodic-table poster on the back wall: the real 18-column shape, f-block
 * pulled out underneath, one cell (platinum - the slab on the cluster) in pine.
 */
const PT_ROWS: [number, number][][] = [
  [[1, 1], [18, 18]],
  [[1, 2], [13, 18]],
  [[1, 2], [13, 18]],
  [[1, 18]], [[1, 18]], [[1, 18]], [[1, 18]],
];
function PeriodicTable() {
  const x0 = 196, y0 = 70, c = 5.4, g = 0.9;
  const cell = 'color-mix(in srgb, var(--text) 12%, var(--ls-bg))';
  const cells: React.ReactElement[] = [];
  PT_ROWS.forEach((spans, r) => spans.forEach(([a, b]) => {
    for (let col = a; col <= b; col++) {
      const pt = r === 5 && col === 10;
      cells.push(<rect key={`${r}-${col}`} x={x0 + (col - 1) * c} y={y0 + r * c} width={c - g} height={c - g} rx=".5" fill={pt ? 'var(--primary)' : cell} />);
    }
  }));
  for (let r = 0; r < 2; r++) for (let col = 0; col < 14; col++) {
    cells.push(<rect key={`f${r}-${col}`} x={x0 + (col + 3) * c} y={y0 + (7.5 + r) * c} width={c - g} height={c - g} rx=".5" fill={cell} />);
  }
  return (
    <g>
      <rect x={x0 - 8} y={y0 - 10} width={18 * c + 16 - g} height={9.5 * c + 18 - g} rx="1.5" fill={BG} stroke={FAINT} strokeWidth={1} />
      <g stroke="none">{cells}</g>
    </g>
  );
}

/** Argon for the tube furnace: two cylinders strapped to the wall at the end of the bench, one line to the tube. */
function GasCylinders() {
  const cyl = (cx: number, label: string) => (
    <g key={cx}>
      <path d={`M${cx - 6} 248v-92a6 6 0 0 1 6-6a6 6 0 0 1 6 6v92z`} fill={BG} />
      <path d={`M${cx - 1.6} 150v-5h3.2v5`} fill={BG} />
      <path d={`M${cx - 6} 170h12`} stroke={FAINT} strokeWidth={0.8} />
      <text x={cx} y="182" textAnchor="middle" fontSize="5.5" fill={FAINT} stroke="none" fontFamily={MONO}>{label}</text>
    </g>
  );
  return (
    <g>
      {cyl(158, 'Ar')}
      {cyl(172, 'Ar')}
      {/* wall straps */}
      <path d="M150 194h30M150 226h30" stroke={FAINT} strokeWidth={1} />
      {/* regulator on the right one, and the line to the furnace tube */}
      <circle cx="172" cy="141" r="3.4" fill={BG} />
      <path d="M172 139.4v1.8l1.2.8" strokeWidth={0.7} />
      <path d="M175.4 141h4.6c1.4 0 2.2.8 2.2 2.2v92.4c0 1.6.8 2.4 2.4 2.4h1.4" stroke={FAINT} strokeWidth={1} />
    </g>
  );
}

function Bench() {
  const dashRight = SC.x + DASH_W;
  const codeX = dashRight + 2;
  return (
    <g>
      {/* tube furnace: insulated body, quartz tube through it, controller */}
      <g transform="translate(-14 0)">
      <path d="M200 236h76M200 242h76" />
      <path d="M200 233v12M276 233v12" strokeWidth={1.6} />
      <rect x="216" y="224" width="44" height="30" rx="5" fill={BG} />
      <rect className="ls-a ls-glow" x="220" y="236.5" width="36" height="5" rx="2.5" fill="#e08a4c" stroke="none" />
      <path d="M216 236h44M216 242h44" stroke={FAINT} strokeWidth={0.9} />
      <path d="M222 254v4M254 254v4" />
      <rect x="280" y="236" width="22" height="22" rx="2" fill={BG} />
      <rect x="283" y="239" width="16" height="7" rx="1" fill="#1d201e" stroke="none" />
      <text className="ls-a ls-temp0" x="291" y="244.6" textAnchor="middle" fontSize="4.6" fill="#7cc9a2" stroke="none" fontFamily={MONO}>25°C</text>
      <text className="ls-a ls-temp1" x="291" y="244.6" textAnchor="middle" fontSize="4.6" fill="#e2c47e" stroke="none" fontFamily={MONO}>320°C</text>
      <text className="ls-a ls-temp2" x="291" y="244.6" textAnchor="middle" fontSize="4.6" fill="#e08a4c" stroke="none" fontFamily={MONO}>600°C</text>
      <circle cx="291" cy="252" r="2" />
      </g>

      {/* analytical balance in its draft shield */}
      <path d="M306 258v-8h38v8" fill={BG} />
      <path d="M309 250v-28h32v28" />
      <path d="M314 228l8-5M316 236l12-8" stroke={FAINT} strokeWidth={0.8} opacity=".7" />
      <path d="M317 246h16M325 246v4" />
      <path className="ls-a ls-heap" d="M320 246c1.5-3 8.5-3 10 0z" fill="#e8e1cf" stroke="currentColor" strokeWidth={0.6} />
      <circle className="ls-a ls-powder" cx="325" cy="236" r=".9" fill="currentColor" stroke="none" />
      <text className="ls-a ls-mass0" x="325" y="256.2" textAnchor="middle" fontSize="4.6" fill="currentColor" stroke="none" fontFamily={MONO}>0.000 g</text>
      <text className="ls-a ls-mass1" x="325" y="256.2" textAnchor="middle" fontSize="4.6" fill="currentColor" stroke="none" fontFamily={MONO}>0.248 g</text>
      <text className="ls-a ls-mass2" x="325" y="256.2" textAnchor="middle" fontSize="4.6" fill="currentColor" stroke="none" fontFamily={MONO}>0.512 g</text>

      {/* the monitor: Rune on the left, the analysis script on the right */}
      <rect x={SC.x - 5} y={SC.y - 5} width={SC.w + 10} height={SC.h + 10} rx="4" fill={BG} />
      <rect x={SC.x} y={SC.y} width={DASH_W} height={SC.h} rx="2" fill={BG} strokeWidth={0.5} stroke={FAINT} />
      <g stroke="none" fill="currentColor">
        <circle cx={SC.x + 6} cy={SC.y + 7} r="2.3" fill="none" stroke="currentColor" strokeWidth={0.6} />
        <circle cx={SC.x + 8.8} cy={SC.y + 5.6} r=".95" fill="var(--primary)" />
        <text x={SC.x + 11.5} y={SC.y + 8.6} fontSize="5" fontWeight={600} fontFamily="var(--font-geist), sans-serif">Yesterday’s tasks</text>
        <text x={SC.x + 4} y={SC.y + 15.4} fontSize="3.6" fill={FAINT} fontFamily="var(--font-geist), sans-serif">Mon 12 Oct</text>
        <text className="ls-a ls-open" x={dashRight - 3} y={SC.y + 15.4} fontSize="3.6" textAnchor="end" fill={FAINT} fontFamily="var(--font-geist), sans-serif">4 not done</text>
        <text className="ls-a ls-alldone" x={dashRight - 3} y={SC.y + 15.4} fontSize="3.8" fontWeight={600} textAnchor="end" fill="var(--primary)" fontFamily="var(--font-geist), sans-serif">All done</text>
      </g>
      <path d={`M${SC.x + 2} ${SC.y + 19}h${DASH_W - 4}`} stroke={FAINT} strokeWidth={0.4} />
      {TASKS.map((task, k) => {
        const y = ROW0 + k * ROW_H;
        return (
          <g key={task} className={`ls-a ls-row-${k}`}>
            <rect x={SC.x + 4} y={y - 4.6} width="5.4" height="5.4" rx="1.4" fill={BG} strokeWidth={0.55} />
            <g className={`ls-a ls-tick-${k}`}>
              <rect x={SC.x + 4} y={y - 4.6} width="5.4" height="5.4" rx="1.4" fill="var(--primary)" stroke="none" />
              <path d={`M${SC.x + 5.3} ${y - 2}l1.1 1.1 1.9-2.2`} stroke="var(--background, #fff)" strokeWidth={0.7} />
            </g>
            <text className={`ls-a ls-done-${k}`} x={SC.x + 12} y={y} fontSize="4.3" fill="currentColor" stroke="none" fontFamily="var(--font-geist), sans-serif">{task}</text>
            <path className={`ls-a ls-strike-${k}`} d={`M${SC.x + 11.6} ${y - 1.5}h${task.length * 2.05}`} strokeWidth={0.4} opacity=".6" />
            <text className="ls-a ls-prio" x={dashRight - 3} y={y} fontSize="3.4" textAnchor="end" fill={FAINT} stroke="none" fontFamily={MONO}>{k + 1}</text>
          </g>
        );
      })}
      <text className="ls-a ls-alldone" x={SC.x + 4} y={SC.y + SC.h - 4} fontSize="3.8" fontWeight={600} fill="var(--primary)" stroke="none" fontFamily="var(--font-geist), sans-serif">Done at 11:52 AM, before noon</text>

      <g clipPath="url(#ls-code)" stroke="none">
        <rect x={codeX} y={SC.y} width={SC.w - DASH_W - 2} height={SC.h} fill="#1d201e" />
        <rect x={codeX} y={SC.y} width={SC.w - DASH_W - 2} height="6" fill="#151715" />
        <text x={codeX + 2.5} y={SC.y + 4.4} fontSize="3" fill="#d9d7cd" fontFamily={MONO}>analysis.py</text>
        {CODE.map((toks, i) => (
          <g key={i}>
            <text x={codeX + 2} y={SC.y + 13 + i * 5.2} fontSize="2.7" fontFamily={MONO}>
              {toks.map(([t, kind], j) => <tspan key={j} fill={TOK[kind]}>{t}</tspan>)}
            </text>
            <rect className={`ls-a ls-line-${i}`} x={codeX + 1.5} y={SC.y + 10.3 + i * 5.2} width="44" height="4" fill="#1d201e" />
          </g>
        ))}
        <rect className="ls-a ls-caret" x={codeX + 20} y={SC.y + 10.3 + 5 * 5.2} width=".7" height="3.6" fill="#7cc9a2" />
      </g>
      <path d={`M${SC.x + SC.w / 2} ${SC.y + SC.h + 5}v20M${SC.x + SC.w / 2 - 12} ${258}h24`} />

      {/* keyboard */}
      <path d="M362 258l4-6h40l4 6z" fill={BG} />
      <path d="M370 255.6h32" stroke={FAINT} strokeWidth={0.9} strokeDasharray="2.4 2" />

      {/* two lab notebooks, squared up at the far end */}
      <rect x="494" y="252" width="30" height="6" rx="1" fill={BG} />
      <rect x="496.5" y="247" width="26" height="5" rx="1" fill={BG} />
      <path d="M499 247v5" stroke="var(--primary)" strokeWidth={1.2} />

      {/* the bench: one long top, cabinets below */}
      <path d="M180 258h350" strokeWidth={1.6} />
      <rect x="184" y="260" width="342" height="40" fill={BG} />
      <path d="M184 260v40h342v-40M280 262v38M362 262v38M444 262v38" />
      <path d="M228 276h8M318 276h8M400 276h8M482 276h8" stroke={FAINT} />
    </g>
  );
}

function Chair() {
  return (
    <g stroke={FAINT} strokeWidth={1}>
      <rect x="369" y="226" width="30" height="34" rx="6" fill={BG} />
    </g>
  );
}

/** The student, in the Rune character's own 48-unit space. */
function Student() {
  return (
    <g className="ls-a ls-stu">
      <g transform="translate(312 175.2) scale(3)" strokeWidth={0.38}>
        <g className="ls-a ls-sit">
          <g className="ls-a ls-bob">
            <g className="ls-a ls-pack-on"><rect x="18.4" y="21" width="11.2" height="10" rx="2.4" fill={BG} /></g>
            <g className="ls-a ls-leg-l">
              <path d="M22.3 31.2l-.5 9.1" />
              <path d="M21.8 40.3c-1.7-.1-2.9.4-2.9 1.1 0 .6 1.3.8 2.9.6.6-.1.9-.5.9-.9s-.3-.8-.9-.8z" fill={BG} />
            </g>
            <g className="ls-a ls-leg-r">
              <path d="M25.7 31.2l.5 9.1" />
              <path d="M26.2 40.3c1.7-.1 2.9.4 2.9 1.1 0 .6-1.3.8-2.9.6-.6-.1-.9-.5-.9-.9s.3-.8.9-.8z" fill={BG} />
            </g>
            <g className="ls-a ls-warm">
              <path className="ls-a ls-swing-l" d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" />
              <path className="ls-a ls-swing-r" d="M28.6 22.2c.6 2.4.9 4.8.8 7.4" />
            </g>
            <path d="M20.6 20.6c2.2-.6 4.6-.6 6.8 0l.5 10.2c-2.6.6-5.2.6-7.8 0z" fill={BG} />
            <path d="M20.7 20.6c-.9.4-1.6 1.1-2.1 2l1.6.9M27.3 20.6c.9.4 1.6 1.1 2.1 2l-1.6.9" />
            <path d="M22.8 20.4c.4.9.8 1.3 1.2 1.3s.8-.4 1.2-1.3M24 18.9v1.4" />
            <g className="ls-a ls-pack-on"><path d="M21.6 21.2l.5 6.4M26.4 21.2l-.5 6.4" strokeWidth={0.32} /></g>
            <path d="M24.1 4.9c4.4-.1 7.7 3 7.6 7.1-.1 4-3.5 7-7.8 6.9-4.2 0-7.5-3.1-7.4-7.1.1-3.9 3.4-6.8 7.6-6.9z" fill={BG} />
            <path d="M16.6 10.6c-1.4-.3-2.2 1.1-1.6 2.3.3.6 1 .9 1.7.7M31.6 10.6c1.4-.3 2.2 1.1 1.6 2.3-.3.6-1 .9-1.7.7" />
            <path d="M22.3 5.1c-.5-1-.5-2 0-2.9M24.4 4.9c0-1 .4-1.9 1.1-2.5M26.5 5.4c.4-.8 1-1.3 1.8-1.6" />
            <g className="ls-a ls-gaze">
              <g className="ls-a ls-blink" fill="currentColor" stroke="none">
                <circle cx="21.3" cy="11.4" r=".85" />
                <circle cx="26.7" cy="11.4" r=".85" />
              </g>
            </g>
            <path className="ls-a ls-det" d="M19.8 8.6l2.6.7M28.2 8.6l-2.6.7" strokeWidth={0.42} />
            <path className="ls-a ls-smile" d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
            <path className="ls-a ls-hmm" d="M22.6 15.6c.9-.4 1.9-.1 2.8-.3" />
            <path className="ls-a ls-grin" d="M22 14.8c1.3 1.6 3.4 1.6 4.6 0z" fill={BG} />
            <path className="ls-a ls-sweat" d="M32.6 5.4c.7 1 1 1.6 1 2.1a1 1 0 0 1-2 0c0-.5.3-1.1 1-2.1z" strokeWidth={0.28} />
            <text className="ls-a ls-q" x="13" y="5" fontSize="5" fill="currentColor" stroke="none" fontFamily="var(--font-serif)">?</text>
            <text className="ls-a ls-q ls-q2" x="31.5" y="2.6" fontSize="4" fill="currentColor" stroke="none" fontFamily="var(--font-serif)">?</text>

            {/* two hands on the keyboard; one scratches his head while he's lost */}
            <g className="ls-a ls-hands">
              <g className="ls-a ls-hand-l"><g className="ls-a ls-type-l"><path d="M19.4 22.2c.4 1.2 1.1 2 2 2.6" /><circle cx="21.6" cy="25" r=".55" fill={BG} /></g></g>
              <g className="ls-a ls-hand-r"><g className="ls-a ls-type-r"><path d="M28.6 22.2c-.4 1.2-1.1 2-2 2.6" /><circle cx="26.4" cy="25" r=".55" fill={BG} /></g></g>
              <g className="ls-a ls-scratch"><path d="M28.6 22.2c1.6-1.8 2.4-4.4 2.4-7.4" /><circle cx="31" cy="14.6" r=".6" fill={BG} /></g>
            </g>

            {/* extra hand: weighing powder on the balance with a spatula */}
            <g className="ls-a ls-synth">
              <path d="M20.5 24.5c-3.4-1.6-6.4-3.4-9.4-6.2-1.8-1.8-3.4-4.6-5-8" />
              <circle cx="6" cy="10.3" r=".65" fill={BG} />
              <g className="ls-a ls-spatula"><path d="M6.1 10.9l-1.2 6.6" strokeWidth={0.32} /><path d="M4.9 17.4l-.3 1.4" strokeWidth={0.75} /></g>
            </g>
            <g className="ls-a ls-thumb">
              <path d="M19.4 22.2c-1.4-.6-2.6-1.8-3.2-3.4" />
              <path d="M14.4 15.6h2.4a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H15a1 1 0 0 1-1-1v-1.4M14.8 15.6c-.2-1.2.1-2.2.8-2.8" fill={BG} />
            </g>

            {/* extra hand: a paper to read */}
            <g className="ls-a ls-paper">
              <path d="M20.5 25c-2 .3-4.2-.4-6-2.2" />
              <g transform="rotate(-8 9.1 17.5)">
                <rect x="5.3" y="12.6" width="7.6" height="9.8" rx=".4" fill={BG} />
                <path d="M6.6 14.6h4" stroke="var(--primary)" strokeWidth={0.4} />
                <path d="M6.6 16.3h5M6.6 17.8h5M6.6 19.3h3.4M6.6 20.8h4.4" strokeWidth={0.22} />
                <rect className="ls-a ls-page" x="5.3" y="12.6" width="7.6" height="9.8" rx=".4" fill="none" strokeWidth={0.28} />
              </g>
              <circle cx="14.4" cy="22.8" r=".6" fill={BG} />
            </g>

            {/* extra hand: the coffee */}
            <g className="ls-a ls-cup-arm">
              <path className="ls-a ls-cup-rest" d="M27.5 24.5c2.4-.6 4.6-1.8 6.4-3.6" />
              <path className="ls-a ls-cup-sip" d="M27.5 24.5c.3-1.4.4-2.8.2-4.2" />
              <g className="ls-a ls-mug">
                <path d="M34 15.6h6v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" fill={BG} />
                <path d="M34 16.8h-.9a1.3 1.3 0 0 0 0 2.6h.9" />
                <path className="ls-a ls-steam" d="M36 11.4c-.6.8.6 1.4 0 2.2M38.2 11.4c-.6.8.6 1.4 0 2.2" strokeWidth={0.26} />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

/** The professor: older, taller, lab coat and tie, glasses, moustache, clipboard - and a Newton-era horsehair wig. */
function Supervisor() {
  return (
    <g className="ls-a ls-sup">
      <g transform="translate(503.2 159.2) scale(3.2)" strokeWidth={0.36}>
        <g transform="rotate(-2.5 24 43)">
          <g className="ls-a ls-sleg-l">
            <path d="M22.4 36.2l-.3 6.2" />
            <path d="M22 42.3c-2-.1-3.3.5-3.3 1.2s1.4.8 3.3.7c.7 0 1.1-.4 1.1-.9s-.4-1-1.1-1z" fill={BG} />
          </g>
          <g className="ls-a ls-sleg-r">
            <path d="M25.6 36.2l.3 6.2" />
            <path d="M26 42.3c2-.1 3.3.5 3.3 1.2s-1.4.8-3.3.7c-.7 0-1.1-.4-1.1-.9s.4-1 1.1-1z" fill={BG} />
          </g>
          <path d="M19.8 17.4c-1.3 6-1.8 12.4-1.9 18.8h12.2c-.1-6.4-.6-12.8-1.9-18.8-1.4-.5-2.8-.7-4.2-.7s-2.8.2-4.2.7z" fill={BG} />
          <path d="M21.7 17l2.3 6.4 2.3-6.4M24 23.4v12.8" />
          <path d="M24 17.6l-.75 1.1.75 4 .75-4z" fill="var(--primary)" stroke="none" />
          <path d="M26.6 22.4h2.2M27.2 22.4v-1.4M27.9 22.4v-1" strokeWidth={0.26} />
          <path d="M28.3 18.6c1.1 2.8 1.3 5.4.7 7.8l-1.6.4M26.6 26.2h2.6" />
          <path d="M19.7 18.6c-1.3 2.8-1.8 5.6-1.4 8.4" />
          <g transform="rotate(-8 16 30)">
            <rect x="13.2" y="26.2" width="5.4" height="7.2" rx=".5" fill={BG} />
            <path d="M14.9 26.2h2M14.2 28.4h3.4M14.2 30h3.4M14.2 31.6h2.2" strokeWidth={0.24} />
          </g>
          {/* the wig: a great white mane of curls to the shoulders, parted in the middle */}
          <path d="M24 .4c-5.6-.2-9 3.6-9.2 8-.9 1.5-1.4 3.4-1 5.2.3 1.7-.5 3.4-.2 5.1.3 2.3 1.7 3.8 3.2 4.6h14.4c1.5-.8 2.9-2.3 3.2-4.6.3-1.7-.5-3.4-.2-5.1.4-1.8-.1-3.7-1-5.2-.2-4.4-3.6-8.2-9.2-8z" fill="#f4f0e4" />
          <path d="M16.2 10.2c-1.1.6-1.1 2.1 0 2.7M15.8 13.7c-1.1.6-1.1 2.1 0 2.7M16.1 17.2c-1.1.6-1.1 2.1 0 2.7M31.8 10.2c1.1.6 1.1 2.1 0 2.7M32.2 13.7c1.1.6 1.1 2.1 0 2.7M31.9 17.2c1.1.6 1.1 2.1 0 2.7M18.6 21.6c.5-1 1.7-1 2.2 0M27.2 21.6c.5-1 1.7-1 2.2 0M19.2 2.9c.5-1 1.9-1 2.4 0M26.4 2.9c.5-1 1.9-1 2.4 0M24 .6v2.2" strokeWidth={0.28} stroke="#7a7466" />
          <path d="M24 2.6c3.5 0 6.2 2.9 6.1 6.6-.1 3.8-2.8 6.8-6.1 6.8s-6.1-3-6.1-6.8c0-3.7 2.6-6.6 6.1-6.6z" fill={BG} />
          <path d="M18.1 5.2c1.6-1.8 3.7-2.6 5.9-2.6s4.3.8 5.9 2.6c-1.9-.6-3.9-.6-5.9.4-2-1-4-1-5.9-.4z" fill="#f4f0e4" />
          <circle cx="21.7" cy="9.4" r="1.6" fill={BG} />
          <circle cx="26.3" cy="9.4" r="1.6" fill={BG} />
          <path d="M23.3 9.3h1.4" />
          <circle cx="21.1" cy="9.6" r=".45" fill="currentColor" stroke="none" />
          <circle cx="25.7" cy="9.6" r=".45" fill="currentColor" stroke="none" />
          <path className="ls-a ls-brows" d="M20 7.1l2.9-.5M25.1 6.6l2.9.5" strokeWidth={0.42} />
          <path d="M21.9 12.6c.9-.6 1.7-.6 2.1-.1.4-.5 1.2-.5 2.1.1" strokeWidth={0.42} />
          <path d="M23 14h2" />
        </g>
      </g>
    </g>
  );
}
