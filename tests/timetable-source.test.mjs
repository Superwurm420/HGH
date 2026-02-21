import { loadTimetableSource } from '../src/data/timetable-source.js';

const originalFetch = globalThis.fetch;

function createResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

function makePdfRaw(updatedAt, subjectLabel = 'PDF') {
  const tokenRows = [
    'class:HT11;day:mo;slot:1;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:mo;slot:2;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:di;slot:1;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:di;slot:2;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:mi;slot:1;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:mi;slot:2;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:do;slot:1;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:do;slot:2;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:fr;slot:1;subject:' + subjectLabel + ';teacher:X;room:1',
    'class:HT11;day:fr;slot:2;subject:' + subjectLabel + ';teacher:X;room:1',
  ];

  const items = tokenRows.map((text, idx) => ({ str: text, x: 10, y: 100 + idx * 10 }));
  return { meta: { updatedAt }, items };
}

async function runScenario({ pdfRaw, jsonModel }) {
  globalThis.fetch = async (url) => {
    if (String(url).includes('stundenplan.pdf.raw.json')) {
      return createResponse(pdfRaw);
    }
    if (String(url).includes('stundenplan.json')) {
      return createResponse(jsonModel);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  return loadTimetableSource();
}

const newerJson = await runScenario({
  pdfRaw: makePdfRaw('2026-02-20T08:00:00.000Z', 'PDF'),
  jsonModel: {
    meta: { updatedAt: '2026-02-21T08:00:00.000Z' },
    timeslots: [{ id: '1', time: '08:00-08:45' }],
    classes: { HT11: { mo: [{ slotId: '1', subject: 'JSON' }] } },
  },
});

if (newerJson.debug.source !== 'json') {
  throw new Error(`Expected json source for newer JSON, got ${newerJson.debug.source}`);
}
if (newerJson.data?.classes?.HT11?.mo?.[0]?.subject !== 'JSON') {
  throw new Error('Expected JSON timetable payload to be selected');
}

const newerPdf = await runScenario({
  pdfRaw: makePdfRaw('2026-02-22T08:00:00.000Z', 'PDF'),
  jsonModel: {
    meta: { updatedAt: '2026-02-21T08:00:00.000Z' },
    timeslots: [{ id: '1', time: '08:00-08:45' }],
    classes: { HT11: { mo: [{ slotId: '1', subject: 'JSON' }] } },
  },
});

if (newerPdf.debug.source !== 'pdf-v2') {
  throw new Error(`Expected pdf-v2 source for newer PDF, got ${newerPdf.debug.source}`);
}
if (newerPdf.data?.classes?.HT11?.mo?.[0]?.subject !== 'PDF') {
  throw new Error('Expected parsed PDF timetable payload to be selected');
}

globalThis.fetch = originalFetch;

console.log('timetable-source source-selection passed');
