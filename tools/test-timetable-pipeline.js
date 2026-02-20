import assert from 'node:assert/strict';
import { parseAndNormalizeTimetable } from '../timetable-parser.js';

const sample = {
  meta: { source: 'test.pdf' },
  timeslots: [{ id: '1', time: '08:00–08:45' }, { id: '2', time: '08:45–09:30' }],
  classes: {
    HT11: {
      mo: [
        { slotId: '1', subject: 'Deutsch', teacher: 'MEL', room: '6' },
        { slotId: '2', subject: 'Mathe', teacher: 'TAM', room: '5' }
      ]
    },
    HT12: { mo: { sameAs: 'HT11' } }
  }
};

const parsed = parseAndNormalizeTimetable(sample);
assert.equal(parsed.ok, true);
assert.equal(parsed.model.classes.HT12.mo.length, 2);
assert.equal(parsed.model.classes.HT11.mo[0].subject, 'Deutsch');

const invalid = parseAndNormalizeTimetable({ timeslots: [{ id: '1', time: '08:00–08:45' }], classes: { HT11: { mo: [{ subject: 'X' }] } } });
assert.equal(invalid.ok, false);
assert.ok(invalid.issues.some((msg) => msg.includes('slotId')));

console.log('timetable-pipeline tests passed');
