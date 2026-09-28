import { describe, expect, it } from 'vitest';
import pieceJson from '../../public/pieces/placeholder-hard.json';
import {
  addGroup,
  addInstrument,
  addLine,
  addPart,
  addSection,
  addSurface,
  appendCell,
  cycleToken,
  emptyPiece,
  formatHit,
  formatPieceJson,
  insertCell,
  mergeWithPreviousGroup,
  moveLine,
  moveSection,
  parsePieceFile,
  parseToken,
  partPulses,
  pieceToJson,
  removeCell,
  removeLine,
  removePart,
  removeSection,
  removeSurface,
  resolveEditorCell,
  setCell,
  slugId,
  splitGroup,
  uniqueId,
  updateInstrument,
  updateLine,
  updatePart,
  updatePieceMeta,
  updateSection,
  updateSurface,
  withDynamic,
  withHit,
  type CellLoc,
} from './editPiece';
import { loadPiece } from './loadPiece';
import type { PieceJson } from './types';

const RAW = pieceJson as PieceJson;

/** The section's lines of one part; throws when absent so tests read cleanly. */
function lines(json: PieceJson, sectionIndex: number, partId: string) {
  const found = json.sections[sectionIndex].lines[partId];
  if (found === undefined) throw new Error(`no lines for ${partId} in section ${sectionIndex}`);
  return found;
}

const loc = (sectionIndex: number, lineIndex: number, groupIndex: number, cellIndex: number, partId = 'main'): CellLoc => ({
  sectionIndex,
  partId,
  lineIndex,
  groupIndex,
  cellIndex,
});

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

describe('cycleToken', () => {
  it('cycles - → R → L → B → ~ → -', () => {
    expect(cycleToken('-')).toBe('R');
    expect(cycleToken('R')).toBe('L');
    expect(cycleToken('L')).toBe('B');
    expect(cycleToken('B')).toBe('~');
    expect(cycleToken('~')).toBe('-');
  });

  it('keeps surface, marks and syllable while the hand changes', () => {
    expect(cycleToken("R:rim'^{딱}")).toBe("L:rim'^{딱}");
    expect(cycleToken('L/R>{그덩}')).toBe('L/L>{그덩}');
  });

  it('treats a malformed token like a rest', () => {
    expect(cycleToken('RL')).toBe('R');
  });
});

describe('formatHit and parseToken', () => {
  it('round-trips every token of the placeholder piece', () => {
    for (const section of RAW.sections) {
      for (const partLines of Object.values(section.lines)) {
        for (const line of partLines) {
          for (const group of line.groups) {
            for (const token of group) {
              const cell = parseToken(token, ['head', 'rim']);
              expect(cell).not.toBeNull();
              if (cell === null || cell.kind !== 'hit') continue;
              const formatted = formatHit(cell);
              expect(parseToken(formatted, ['head', 'rim'])).toEqual({ ...cell, token: formatted });
            }
          }
        }
      }
    }
  });

  it('writes modifiers in a fixed order and drops an empty surface', () => {
    expect(withHit('-', { hand: 'B', modifiers: { cross: true, strong: true } })).toBe('B>x');
    expect(withHit('R', { surface: '' })).toBe('R');
    expect(withHit('R', { surface: 'rim', gueumOverride: '딱' })).toBe('R:rim{딱}');
    expect(withHit('R:rim{딱}', { gueumOverride: null, surface: null })).toBe('R');
  });

  it('turns a rest or extender into a right-hand hit before patching', () => {
    expect(withHit('~', { grace: 'L' })).toBe('L/R');
    expect(withHit('-', { modifiers: { lift: true } })).toBe('R^');
  });

  it('keeps unknown marks', () => {
    expect(withHit('R?', { hand: 'L' })).toBe('L?');
  });

  it('withDynamic sets exactly one loudness mark', () => {
    expect(withDynamic("R_'", 'strong')).toBe('R>');
    expect(withDynamic('R>^', 'normal')).toBe('R^');
    expect(withDynamic('L', 'soft')).toBe('L_');
  });
});

describe('resolveEditorCell', () => {
  const drum = emptyPiece().instruments[0];

  it('resolves surface, sound and syllable like the loader', () => {
    const cell = resolveEditorCell('B', drum);
    expect(cell).toMatchObject({ kind: 'hit', surfaceId: 'head', sound: 'low', gueum: '덩' });
    expect(resolveEditorCell('R:rim', drum)).toMatchObject({ surfaceId: 'rim', sound: 'click', gueum: '딱' });
    expect(resolveEditorCell('R{그}', drum)).toMatchObject({ gueum: '그' });
    expect(resolveEditorCell('R', drum)).toMatchObject({ gueum: 'R' });
  });

  it('keeps an unknown surface visible instead of throwing', () => {
    expect(resolveEditorCell('R:side', drum)).toMatchObject({ surfaceId: 'side', sound: '', gueum: 'R' });
  });

  it('returns rests and extenders as they are, and null for a malformed token', () => {
    expect(resolveEditorCell('-', drum)).toEqual({ kind: 'rest', token: '-' });
    expect(resolveEditorCell('~', undefined)).toEqual({ kind: 'extender', token: '~' });
    expect(resolveEditorCell('R~', drum)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

describe('ids', () => {
  it('slugs free text to ASCII and falls back when nothing is left', () => {
    expect(slugId('Build ×8', 'section')).toBe('build-8');
    expect(slugId('  Cross phrase 2 ', 'x')).toBe('cross-phrase-2');
    expect(slugId('후렴', 'section')).toBe('section');
  });

  it('numbers a taken id', () => {
    expect(uniqueId('a', ['b'])).toBe('a');
    expect(uniqueId('a', ['a'])).toBe('a-2');
    expect(uniqueId('a', ['a', 'a-2'])).toBe('a-3');
  });
});

// ---------------------------------------------------------------------------
// Whole pieces
// ---------------------------------------------------------------------------

describe('emptyPiece', () => {
  it('is a valid piece with one section of rests', () => {
    const piece = loadPiece(emptyPiece());
    expect(piece.sections).toHaveLength(1);
    expect(piece.sections[0].pulses).toBe(6);
  });
});

describe('pieceToJson', () => {
  it('round-trips the placeholder piece through the loader', () => {
    const once = loadPiece(RAW);
    const json = pieceToJson(once);
    expect(loadPiece(json)).toEqual(once);
  });

  it('leaves defaults out', () => {
    const json = pieceToJson(loadPiece(RAW));
    const open = json.sections[0];
    expect(open).not.toHaveProperty('repeat');
    expect(open).not.toHaveProperty('crescendo');
    expect(open).not.toHaveProperty('cueIn');
    expect(json.parts[0]).not.toHaveProperty('lead');
    const build = json.sections.find((s) => s.id === 'build');
    expect(build).toMatchObject({ repeat: 8, crescendo: true });
    expect(build?.lines.hard[0]).toMatchObject({ pauseAfter: 0 });
    expect(json.sections[0].lines.hard[0]).not.toHaveProperty('pauseAfter');
  });
});

describe('formatPieceJson', () => {
  it('parses back to the same JSON with each group on one line', () => {
    const text = formatPieceJson(RAW);
    expect(JSON.parse(text)).toEqual(RAW);
    expect(text).toContain('["B{덩}", "B>{덩}"]');
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('parsePieceFile', () => {
  it('rejects non-JSON and invalid pieces with readable messages', () => {
    expect(() => parsePieceFile('{ nope')).toThrow('not JSON');
    expect(() => parsePieceFile('{"id":"x"}')).toThrow(/title/);
  });

  it('accepts and normalizes a valid file', () => {
    const json = parsePieceFile(JSON.stringify({ ...RAW, extra: 1 }));
    expect(json).not.toHaveProperty('extra');
    expect(json.id).toBe(RAW.id);
  });
});

describe('partPulses', () => {
  it('counts cells plus line pauses', () => {
    expect(partPulses(RAW, 0, 'hard')).toEqual({ cells: 22, pulses: 26 });
    expect(partPulses(RAW, 4, 'hard')).toEqual({ cells: 4, pulses: 4 });
    expect(partPulses(RAW, 0, 'nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sections, lines, groups, cells
// ---------------------------------------------------------------------------

describe('sections', () => {
  it('adds a section with a unique slug id and one line for the first part', () => {
    const json = addSection(addSection(emptyPiece(), 'A'), 'A');
    expect(json.sections.map((s) => s.id)).toEqual(['a', 'a-2', 'a-3']);
    expect(lines(json, 2, 'main')).toHaveLength(1);
    expect(loadPiece(json).sections).toHaveLength(3);
  });

  it('removes, moves and updates sections without touching the input', () => {
    const base = addSection(emptyPiece(), 'B');
    const moved = moveSection(base, 0, 1);
    expect(moved.sections.map((s) => s.id)).toEqual(['b', 'a']);
    expect(base.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(moveSection(base, 1, 1)).toEqual(base);
    expect(removeSection(base, 0).sections.map((s) => s.id)).toEqual(['b']);
    const updated = updateSection(base, 1, { name: 'Build', repeat: 8, crescendo: true, cueIn: 'go', tempoScale: 0.5 });
    expect(updated.sections[1]).toMatchObject({ name: 'Build', repeat: 8, crescendo: true, cueIn: 'go', tempoScale: 0.5 });
    const reset = updateSection(updated, 1, { repeat: 1, crescendo: false, cueIn: '', tempoScale: 1 });
    expect(reset.sections[1]).toEqual({ id: 'b', name: 'Build', lines: base.sections[1].lines });
  });

  it('updatePieceMeta drops a zero linePause', () => {
    const json = updatePieceMeta(emptyPiece(), { title: 'T', linePause: 0 });
    expect(json.title).toBe('T');
    expect(json).not.toHaveProperty('linePause');
  });
});

describe('lines', () => {
  it('adds a line of rests, also for a part silent in the section', () => {
    const json = addLine(addPart(emptyPiece(), 'Second'), 0, 'second');
    expect(lines(json, 0, 'second')).toEqual([{ groups: [['-', '-', '-', '-']] }]);
    expect(lines(addLine(json, 0, 'main'), 0, 'main')).toHaveLength(2);
  });

  it('removes the part key with its last line', () => {
    const json = removeLine(emptyPiece(), 0, 'main', 0);
    expect(json.sections[0].lines).toEqual({});
  });

  it('moves lines and updates note and pause', () => {
    const two = addLine(emptyPiece(), 0, 'main');
    const noted = updateLine(two, 0, 'main', 1, { note: 'second', pauseAfter: 0 });
    expect(lines(noted, 0, 'main')[1]).toEqual({ groups: [['-', '-', '-', '-']], note: 'second', pauseAfter: 0 });
    const moved = moveLine(noted, 0, 'main', 1, -1);
    expect(lines(moved, 0, 'main')[0].note).toBe('second');
    const cleared = updateLine(noted, 0, 'main', 1, { note: '', pauseAfter: undefined });
    expect(lines(cleared, 0, 'main')[1]).toEqual({ groups: [['-', '-', '-', '-']] });
  });
});

describe('groups and cells', () => {
  it('sets, appends, inserts and removes cells', () => {
    let json = setCell(emptyPiece(), loc(0, 0, 0, 1), 'R');
    expect(lines(json, 0, 'main')[0].groups[0]).toEqual(['-', 'R', '-', '-']);
    json = appendCell(json, 0, 'main', 0, 0, 'L');
    expect(lines(json, 0, 'main')[0].groups[0]).toEqual(['-', 'R', '-', '-', 'L']);
    json = insertCell(json, loc(0, 0, 0, 1), 0, 'B');
    expect(lines(json, 0, 'main')[0].groups[0]).toEqual(['-', 'B', 'R', '-', '-', 'L']);
    json = insertCell(json, loc(0, 0, 0, 1), 1, '~');
    expect(lines(json, 0, 'main')[0].groups[0]).toEqual(['-', 'B', '~', 'R', '-', '-', 'L']);
    json = removeCell(json, loc(0, 0, 0, 0));
    expect(lines(json, 0, 'main')[0].groups[0]).toEqual(['B', '~', 'R', '-', '-', 'L']);
  });

  it('adds groups, splits and merges them', () => {
    let json = addGroup(emptyPiece(), 0, 'main', 0);
    expect(lines(json, 0, 'main')[0].groups).toHaveLength(2);
    json = splitGroup(json, loc(0, 0, 0, 2));
    expect(lines(json, 0, 'main')[0].groups).toEqual([['-', '-'], ['-', '-'], ['-', '-', '-', '-']]);
    expect(splitGroup(json, loc(0, 0, 0, 0))).toEqual(json);
    json = mergeWithPreviousGroup(json, 0, 'main', 0, 2);
    expect(lines(json, 0, 'main')[0].groups).toEqual([['-', '-'], ['-', '-', '-', '-', '-', '-']]);
    expect(mergeWithPreviousGroup(json, 0, 'main', 0, 0)).toEqual(json);
  });

  it('removing the last cell removes the group, the line, and then the part key', () => {
    let json = splitGroup(emptyPiece(), loc(0, 0, 0, 3));
    json = removeCell(json, loc(0, 0, 1, 0));
    expect(lines(json, 0, 'main')[0].groups).toEqual([['-', '-', '-']]);
    for (let i = 0; i < 3; i += 1) json = removeCell(json, loc(0, 0, 0, 0));
    expect(json.sections[0].lines).toEqual({});
  });

  it('ignores out-of-range locations', () => {
    const json = emptyPiece();
    expect(setCell(json, loc(0, 5, 0, 0), 'R')).toEqual(json);
    expect(setCell(json, loc(0, 0, 5, 0), 'R')).toEqual(json);
    expect(removeCell(json, loc(3, 0, 0, 0), )).toEqual(json);
  });
});

// ---------------------------------------------------------------------------
// Instruments, surfaces and parts
// ---------------------------------------------------------------------------

describe('instruments and surfaces', () => {
  it('adds and removes surfaces and updates their sound and syllables', () => {
    let json = addSurface(emptyPiece(), 0, 'side', 'high');
    expect(json.instruments[0].surfaces.side).toEqual({ sound: 'high' });
    expect(addSurface(json, 0, 'side')).toEqual(json);
    expect(addSurface(json, 0, '')).toEqual(json);
    json = updateSurface(json, 0, 'side', { gueum: { R: '탁', L: '탁' }, sound: 'mid' });
    expect(json.instruments[0].surfaces.side).toEqual({ sound: 'mid', gueum: { R: '탁', L: '탁' } });
    json = updateSurface(json, 0, 'side', { gueum: { R: '', L: '' } });
    expect(json.instruments[0].surfaces.side).toEqual({ sound: 'mid' });
    json = removeSurface(json, 0, 'side');
    expect(json.instruments[0].surfaces).not.toHaveProperty('side');
    expect(loadPiece(json)).toBeTruthy();
  });

  it('adds instruments and renames an id through to the parts', () => {
    let json = addInstrument(emptyPiece(), 'Bucket');
    expect(json.instruments[1]).toMatchObject({ id: 'bucket', defaultSurface: 'head' });
    json = updateInstrument(json, 0, { id: 'big-drum', name: 'Big drum' });
    expect(json.parts[0].instrument).toBe('big-drum');
    expect(loadPiece(json)).toBeTruthy();
  });
});

describe('parts', () => {
  it('adds a part, makes one lead at a time, and renames an id through the sections', () => {
    let json = addPart(emptyPiece(), 'Lead');
    expect(json.parts[1]).toEqual({ id: 'lead', name: 'Lead', instrument: 'drum' });
    json = updatePart(json, 1, { lead: true });
    json = updatePart(json, 0, { lead: true });
    expect(json.parts.map((part) => part.lead ?? false)).toEqual([true, false]);
    json = updatePart(json, 0, { id: 'first' });
    expect(json.sections[0].lines).toHaveProperty('first');
    expect(json.sections[0].lines).not.toHaveProperty('main');
    expect(loadPiece(json)).toBeTruthy();
  });

  it('removes a part and its lines everywhere', () => {
    const json = removePart(addLine(addPart(emptyPiece(), 'Second'), 0, 'second'), 0);
    expect(json.parts.map((part) => part.id)).toEqual(['second']);
    expect(json.sections[0].lines).toEqual({ second: [{ groups: [['-', '-', '-', '-']] }] });
  });
});
