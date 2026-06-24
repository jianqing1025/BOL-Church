import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  extractTokens,
  buildClassifier,
  classifySermonCategory,
  matchesTarget,
  type TrainingRow,
} from './classifier';

describe('normalizeTitle', () => {
  it('strips leading date prefix, urls and speaker names', () => {
    expect(normalizeTitle('2024-05-05 敬拜讚美特會')).toBe('敬拜讚美特會');
    expect(normalizeTitle('主日信息 https://youtu.be/abc')).toBe('主日信息');
    expect(normalizeTitle('Pastor Andy Yu 醫治禱告')).toBe('醫治禱告');
  });
});

describe('extractTokens', () => {
  it('produces CJK bigrams and lowercased ascii words >=3', () => {
    const tokens = extractTokens('敬拜讚美 Worship');
    expect(tokens).toContain('敬拜');
    expect(tokens).toContain('拜讚');
    expect(tokens).toContain('讚美');
    expect(tokens).toContain('worship');
    expect(tokens).not.toContain('的'); // single char dropped
  });
});

const training: TrainingRow[] = [
  { title: '2024-01-07 敬拜讚美', category: 'worship-praise' },
  { title: '2024-01-14 敬拜讚美特會', category: 'worship-praise' },
  { title: '2024-01-21 敬拜讚美', category: 'worship-praise' },
  { title: '2024-02-04 醫治禱告', category: 'healing-prayer' },
  { title: '2024-02-11 醫治禱告會', category: 'healing-prayer' },
  { title: '2024-02-18 醫治禱告', category: 'healing-prayer' },
  { title: '2024-03-03 見證分享', category: 'testimony' },
  { title: '2024-03-10 見證分享', category: 'testimony' },
  { title: '2024-03-17 見證分享', category: 'testimony' },
  { title: '2024-04-07 主日信息', category: 'sunday-worship' },
  { title: '2024-04-14 主日信息', category: 'sunday-worship' },
  { title: '2024-04-21 主日信息', category: 'sunday-worship' },
];

describe('buildClassifier + classifySermonCategory', () => {
  it('classifies a new title from learned keywords', () => {
    const model = buildClassifier(training);
    expect(classifySermonCategory(model, '2024-05-05 敬拜讚美晚會')).toBe('worship-praise');
    expect(classifySermonCategory(model, '2024-05-12 醫治禱告特會')).toBe('healing-prayer');
    expect(classifySermonCategory(model, '2024-05-19 見證分享主日')).toBe('testimony');
  });

  it('falls back to hardcoded keywords when model has no signal', () => {
    const emptyModel = buildClassifier([]);
    expect(classifySermonCategory(emptyModel, '醫治特會')).toBe('healing-prayer');
    expect(classifySermonCategory(emptyModel, '純文字無關鍵詞')).toBe('sunday-worship');
  });
});

describe('matchesTarget', () => {
  it('maps targets to entry type + category', () => {
    expect(matchesTarget('sermon', 'sunday-worship', 'all')).toBe(true);
    expect(matchesTarget('daily-manna', 'sunday-worship', 'all')).toBe(true);
    expect(matchesTarget('sermon', 'worship-praise', 'worship-praise')).toBe(true);
    expect(matchesTarget('sermon', 'sunday-worship', 'worship-praise')).toBe(false);
    expect(matchesTarget('daily-manna', 'sunday-worship', 'daily-manna')).toBe(true);
    expect(matchesTarget('sermon', 'sunday-worship', 'daily-manna')).toBe(false);
    expect(matchesTarget('sermon', 'testimony', 'sermon')).toBe(true);
    expect(matchesTarget('daily-manna', 'sunday-worship', 'sermon')).toBe(false);
  });
});
