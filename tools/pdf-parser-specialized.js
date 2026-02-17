#!/usr/bin/env node
/**
 * HGH Stundenplan PDF Parser - Spezialisiert für Tabellen-Layout
 * 
 * Versteht die spezifische Struktur:
 * - Header: HT11 HT12 HT21 HT22 G11 G21 GT01
 * - Pro Tag (MO, DI, MI, DO, FR): 10 Slots
 * - Pro Slot: Zeit | Fach (Zeile 1) + Lehrkraft (Zeile 2) | Raum
 * 
 * Usage:
 *   node tools/pdf-parser-specialized.js <input.pdf> [options]
 * 
 * Options:
 *   --out <path>         Output JSON file (default: data/timetable.json)
 *   --validFrom <date>   Valid from date (default: today)
 *   --debug              Show debug output
 *   --save-text          Save extracted text to file
 */

import fs from 'node:fs';
import path from 'node:path';

// === Configuration ===
const CONFIG = {
  classes: ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'],
  days: ['MO', 'DI', 'MI', 'DO', 'FR'],
  dayMapping: {
    'MO': 'mo', 'DI': 'di', 'MI': 'mi', 
    'DO': 'do', 'FR': 'fr'
  },
  timeslots: [
    { id: '1', time: '08:00–08:45' },
    { id: '2', time: '08:45–09:30' },
    { id: '3', time: '09:50–10:35' },
    { id: '4', time: '10:35–11:20' },
    { id: '5', time: '11:40–12:25' },
    { id: '6', time: '12:25–13:10' },
    { id: '7', time: 'Mittagspause' },
    { id: '8', time: '14:10–14:55' },
    { id: '9', time: '14:55–15:40' },
    { id: '10', time: '15:45–16:30' }
  ],
  knownTeachers: [
    'STE', 'WED', 'STI', 'BÜ', 'HOFF', 'GRO', 'TAM', 
    'WEN', 'MEL', 'WEZ', 'HOG', 'BER'
  ]
};

// === Argument Parsing ===
const args = {
  input: process.argv[2],
  out: getArg('--out') || 'data/timetable.json',
  validFrom: getArg('--validFrom') || new Date().toISOString().split('T')[0],
  debug: process.argv.includes('--debug'),
  saveText: process.argv.includes('--save-text')
};

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

if (!args.input) {
  console.error('❌ Usage: node pdf-parser-specialized.js <input.pdf> [options]');
  process.exit(1);
}

// === Logging ===
function log(...msgs) {
  if (args.debug) console.log('[DEBUG]', ...msgs);
}

function info(...msgs) {
  console.log('ℹ️ ', ...msgs);
}

function success(...msgs) {
  console.log('✅', ...msgs);
}

function warn(...msgs) {
  console.warn('⚠️ ', ...msgs);
}

function error(...msgs) {
  console.error('❌', ...msgs);
}

// === PDF Text Extraction ===
async function extractPdfText(pdfPath) {
  let PDFParse;
  try {
    const mod = await import('pdf-parse');
    PDFParse = mod.PDFParse || mod.default;
  } catch {
    throw new Error('pdf-parse not installed. Run: npm install pdf-parse');
  }

  if (typeof PDFParse !== 'function') {
    throw new Error('pdf-parse module could not be loaded correctly. Check version compatibility.');
  }

  const buffer = fs.readFileSync(pdfPath);
  const uint8 = new Uint8Array(buffer);
  const pdf = new PDFParse(uint8, {});
  const result = await pdf.getText();
  const text = result.pages.map(p => p.text).join('\n');

  log(`Extracted ${text.length} characters from PDF`);
  return text;
}

// === Token Recognition ===
function isTeacher(token) {
  const clean = token.trim().toUpperCase();
  
  // Known teachers
  if (CONFIG.knownTeachers.includes(clean)) return true;
  
  // Combined teachers (e.g., "WEZ/BER")
  if (clean.includes('/')) {
    return clean.split('/').every(t => 
      CONFIG.knownTeachers.includes(t) || /^[A-ZÄÖÜ]{2,4}$/.test(t)
    );
  }
  
  // Pattern: 2-4 uppercase letters
  return /^[A-ZÄÖÜ]{2,4}$/.test(clean);
}

function isRoom(token) {
  const clean = token.trim();
  
  // Numeric rooms: 1, 2, 3, etc.
  if (/^\d{1,2}$/.test(clean)) return true;
  
  // Special rooms: T1, BS, HS, USF
  if (/^(T\d|BS|HS|USF)$/.test(clean)) return true;
  
  // Alphanumeric: A12, R6, etc.
  if (/^[A-Z]\d{1,3}$/.test(clean)) return true;
  
  return false;
}

function isNotAvailable(token) {
  const clean = token.trim().toUpperCase();
  return clean === '#NV' || clean === '#N/A' || clean === 'N.V.';
}

function isSlotNumber(token) {
  return /^\d{1,2}\.$/.test(token.trim());
}

function isDayMarker(token) {
  const clean = token.trim().toUpperCase();
  return CONFIG.days.includes(clean);
}

// === Text Cleaning ===
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .trim();
}

function normalizeSpaces(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// === Line-based Parser ===
class LineParser {
  constructor(text) {
    this.lines = cleanText(text).split('\n').map(l => l.trim()).filter(Boolean);
    this.currentIndex = 0;
    this.currentDay = null;
    this.result = this.buildEmptyStructure();
  }

  buildEmptyStructure() {
    const structure = {};
    for (const classId of CONFIG.classes) {
      structure[classId] = {};
      for (const day of CONFIG.days) {
        structure[classId][CONFIG.dayMapping[day]] = [];
      }
    }
    return structure;
  }

  parse() {
    while (this.currentIndex < this.lines.length) {
      const line = this.lines[this.currentIndex];
      
      // Check for day marker
      const dayMatch = CONFIG.days.find(d => line.includes(d));
      if (dayMatch) {
        this.currentDay = CONFIG.dayMapping[dayMatch];
        log(`Found day: ${dayMatch} → ${this.currentDay}`);
        this.currentIndex++;
        continue;
      }

      // Check for slot
      const slotMatch = line.match(/^(\d{1,2})\./);
      if (slotMatch && this.currentDay) {
        const slotId = slotMatch[1];
        this.parseSlot(slotId);
      }

      this.currentIndex++;
    }

    return this.result;
  }

  parseSlot(slotId) {
    log(`Parsing slot ${slotId} for day ${this.currentDay}`);
    
    // Collect next few lines (contains subjects and teachers)
    const dataLines = [];
    let tempIndex = this.currentIndex + 1;
    
    while (tempIndex < this.lines.length && dataLines.length < 3) {
      const line = this.lines[tempIndex];
      
      // Stop at next slot or day
      if (isSlotNumber(line) || CONFIG.days.some(d => line.includes(d))) {
        break;
      }
      
      if (line.trim().length > 0) {
        dataLines.push(line);
      }
      
      tempIndex++;
    }

    if (dataLines.length === 0) return;

    // Extract data for each class
    this.extractSlotData(slotId, dataLines);
  }

  extractSlotData(slotId, dataLines) {
    // Combine all data lines
    const combinedText = dataLines.join(' ');
    const tokens = combinedText.split(/\s+/).filter(Boolean);
    
    log(`  Tokens (${tokens.length}):`, tokens.slice(0, 20).join(' '), '...');

    // Try to extract data for each class
    // This is heuristic-based - we need to split tokens among 7 classes
    const tokensPerClass = Math.ceil(tokens.length / CONFIG.classes.length);
    
    CONFIG.classes.forEach((classId, index) => {
      const start = index * tokensPerClass;
      const end = Math.min((index + 1) * tokensPerClass, tokens.length);
      const classTokens = tokens.slice(start, end);
      
      const entry = this.extractEntry(classTokens);
      
      if (entry.subject || entry.teacher || entry.room) {
        this.result[classId][this.currentDay].push({
          slotId,
          ...entry
        });
        
        log(`    ${classId}: ${entry.subject || '—'} | ${entry.teacher || '—'} | ${entry.room || '—'}`);
      }
    });
  }

  extractEntry(tokens) {
    const entry = {
      subject: null,
      teacher: null,
      room: null
    };

    const teachers = [];
    const rooms = [];
    const subjectParts = [];

    for (const token of tokens) {
      if (isNotAvailable(token)) {
        continue;
      } else if (isTeacher(token)) {
        teachers.push(token);
      } else if (isRoom(token)) {
        rooms.push(token);
      } else {
        // Assume it's part of subject
        subjectParts.push(token);
      }
    }

    entry.teacher = teachers[0] || null;
    entry.room = rooms[0] || null;
    entry.subject = subjectParts.length > 0 ? subjectParts.join(' ') : null;

    return entry;
  }
}

// === Statistics ===
function generateStats(classes) {
  const stats = {
    totalEntries: 0,
    byClass: {},
    teachers: new Set(),
    rooms: new Set(),
    subjects: new Set()
  };

  for (const classId of CONFIG.classes) {
    let count = 0;
    for (const dayId of Object.keys(classes[classId])) {
      const entries = classes[classId][dayId];
      count += entries.length;
      stats.totalEntries += entries.length;

      entries.forEach(e => {
        if (e.teacher) stats.teachers.add(e.teacher);
        if (e.room) stats.rooms.add(e.room);
        if (e.subject) stats.subjects.add(e.subject);
      });
    }
    stats.byClass[classId] = count;
  }

  return {
    totalEntries: stats.totalEntries,
    byClass: stats.byClass,
    teachers: Array.from(stats.teachers).sort(),
    rooms: Array.from(stats.rooms).sort(),
    subjects: Array.from(stats.subjects).sort()
  };
}

// === Main ===
(async () => {
  try {
    info(`HGH PDF Parser - Specialized`);
    info(`Input: ${path.basename(args.input)}`);
    console.log('');

    // Extract text
    const text = await extractPdfText(args.input);
    
    if (args.saveText) {
      const textFile = 'debug-pdf-text.txt';
      fs.writeFileSync(textFile, text, 'utf8');
      info(`Saved extracted text to: ${textFile}`);
    }

    // Parse
    const parser = new LineParser(text);
    const classes = parser.parse();

    // Generate statistics
    const stats = generateStats(classes);

    // Build output
    const output = {
      meta: {
        school: 'HGH',
        validFrom: args.validFrom,
        updatedAt: new Date().toISOString(),
        source: path.basename(args.input),
        parser: 'specialized-v1.0',
        stats: {
          totalEntries: stats.totalEntries,
          entriesByClass: stats.byClass,
          teachersFound: stats.teachers.length,
          roomsFound: stats.rooms.length,
          subjectsFound: stats.subjects.length
        }
      },
      timeslots: CONFIG.timeslots,
      classes
    };

    // Write output
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf8');

    console.log('');
    success('Parsing complete!');
    console.log('');
    console.log('📊 Statistics:');
    console.log(`   Total entries: ${stats.totalEntries}`);
    console.log(`   Teachers: ${stats.teachers.length} (${stats.teachers.slice(0, 10).join(', ')}${stats.teachers.length > 10 ? '...' : ''})`);
    console.log(`   Rooms: ${stats.rooms.length} (${stats.rooms.join(', ')})`);
    console.log(`   Subjects: ${stats.subjects.length}`);
    console.log('');
    console.log(`   By class:`);
    Object.entries(stats.byClass).forEach(([cls, count]) => {
      console.log(`     ${cls}: ${count} entries`);
    });
    console.log('');
    info(`Output: ${args.out}`);

    if (stats.totalEntries < 50) {
      console.log('');
      warn('Low entry count detected!');
      warn('The parser may not have recognized the PDF structure correctly.');
      warn('Try running with --debug and --save-text to inspect the extracted text.');
    }

  } catch (err) {
    error('Parsing failed:', err.message);
    if (args.debug) {
      console.error(err);
    }
    process.exit(1);
  }
})();
