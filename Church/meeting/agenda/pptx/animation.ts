import type { SlideStep } from './model';
import { child, children, descendants, num, path, type XmlNode } from './xml';

/**
 * A slide's click animations as steps. Each click in PowerPoint's main
 * sequence is one more step — one more press of 下一頁 — whatever it does;
 * what is drawn only changes with entrances (start hidden, then appear) and
 * exits (disappear). Motion and emphasis are not drawn, but their click still
 * counts, so the host's clicks line up with the deck as it was rehearsed.
 */

interface Effect { cls: string; target: string; paragraphs?: [number, number] }
interface ClickGroup { click: boolean; effects: Effect[] }

export function readMainSequence(slide: XmlNode): ClickGroup[] {
  const timing = child(slide, 'timing');
  const main = descendants(timing, 'seq').find((seq) => child(seq, 'cTn')?.attrs.nodeType === 'mainSeq');
  if (!main) return [];
  return children(path(main, 'cTn', 'childTnLst'), 'par').map((par, index) => {
    const cTn = child(par, 'cTn');
    const effectNodes = descendants(cTn, 'cTn').filter((c) => c.attrs.presetClass);
    const effects: Effect[] = [];
    for (const node of effectNodes) {
      const target = descendants(node, 'spTgt')[0];
      if (!target?.attrs.spid) continue;
      const range = path(target, 'txEl', 'pRg');
      effects.push({
        cls: node.attrs.presetClass,
        target: target.attrs.spid,
        paragraphs: range ? [num(range, 'st', 0), num(range, 'end', 0)] : undefined,
      });
    }
    const startsOnBegin = children(child(cTn, 'stCondLst'), 'cond').some((c) => c.attrs.evt === 'onBegin');
    const firstType = effectNodes[0]?.attrs.nodeType;
    const auto = startsOnBegin || (index === 0 && (firstType === 'afterEffect' || firstType === 'withEffect'));
    return { click: !auto, effects };
  });
}

export function computeSteps(groups: readonly ClickGroup[]): SlideStep[] {
  const hidden = new Set<string>();
  const hiddenParagraphs = new Map<string, Set<number>>();
  const keyOf = (e: Effect) => (e.paragraphs ? `${e.target}#${e.paragraphs[0]}-${e.paragraphs[1]}` : e.target);

  const setVisible = (e: Effect, visible: boolean) => {
    if (!e.paragraphs) {
      if (visible) hidden.delete(e.target); else hidden.add(e.target);
      return;
    }
    let set = hiddenParagraphs.get(e.target);
    if (!set) { set = new Set(); hiddenParagraphs.set(e.target, set); }
    for (let p = e.paragraphs[0]; p <= e.paragraphs[1]; p++) if (visible) set.delete(p); else set.add(p);
  };

  // Whatever enters first starts hidden.
  const seen = new Set<string>();
  for (const group of groups) {
    for (const effect of group.effects) {
      const key = keyOf(effect);
      if (seen.has(key)) continue;
      seen.add(key);
      if (effect.cls === 'entr') setVisible(effect, false);
    }
  }

  const snapshot = (): SlideStep => ({
    hidden: new Set(hidden),
    hiddenParagraphs: new Map([...hiddenParagraphs].filter(([, s]) => s.size).map(([k, s]) => [k, new Set(s)])),
  });

  const steps: SlideStep[] = [snapshot()];
  for (const group of groups) {
    for (const effect of group.effects) {
      if (effect.cls === 'entr') setVisible(effect, true);
      else if (effect.cls === 'exit') setVisible(effect, false);
    }
    if (group.click) steps.push(snapshot());
    else steps[steps.length - 1] = snapshot();
  }
  return steps;
}

export const slideSteps = (slide: XmlNode): SlideStep[] => computeSteps(readMainSequence(slide));
