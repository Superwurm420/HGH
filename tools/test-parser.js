#!/usr/bin/env node
/**
 * HGH Parser Test & Debug Tool
 * 
 * Zeigt visuell was der Parser erkannt hat
 * Hilft bei der Fehlersuche
 * 
 * Usage:
 *   node tools/test-parser.js <timetable.json>
 */

import fs from 'node:fs';
import path from 'node:path';

const jsonFile = process.argv[2] || 'content/stundenplan.json';

if (!fs.existsSync(jsonFile)) {
  console.error(`❌ File not found: ${jsonFile}`);
  console.error('Usage: node tools/test-parser.js <timetable.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

console.log('═══════════════════════════════════════════════════════════════');
console.log('  HGH Stundenplan Parser - Test & Debug Tool');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// === Meta Info ===
console.log('📋 Meta Information:');
console.log(`   School: ${data.meta.school}`);
console.log(`   Valid from: ${data.meta.validFrom}`);
console.log(`   Updated: ${data.meta.updatedAt}`);
console.log(`   Source: ${data.meta.source || 'N/A'}`);
if (data.meta.parser) {
  console.log(`   Parser: ${data.meta.parser}`);
}
console.log('');

// === Statistics ===
if (data.meta.stats || data.meta.statistics) {
  const stats = data.meta.stats || data.meta.statistics;
  console.log('📊 Statistics:');
  console.log(`   Total entries: ${stats.totalEntries || stats.total || 'N/A'}`);
  
  if (stats.entriesByClass || stats.entriesPerClass) {
    console.log('   Entries by class:');
    const byClass = stats.entriesByClass || stats.entriesPerClass;
    Object.entries(byClass).forEach(([cls, count]) => {
      const bar = '█'.repeat(Math.min(count, 50));
      console.log(`     ${cls}: ${count.toString().padStart(3)} ${bar}`);
    });
  }
  
  if (stats.teachersFound) {
    console.log(`   Teachers found: ${stats.teachersFound} (${stats.teachers?.slice(0, 10).join(', ') || ''})`);
  }
  
  if (stats.roomsFound) {
    console.log(`   Rooms found: ${stats.roomsFound}`);
  }
  
  console.log('');
}

// === Classes Overview ===
console.log('📚 Classes Overview:');
const DAYS = ['mo', 'di', 'mi', 'do', 'fr'];
const CLASSES = Object.keys(data.classes);

CLASSES.forEach(classId => {
  const dayEntries = DAYS.map(day => {
    const entries = data.classes[classId][day] || [];
    return entries.length;
  });
  
  const total = dayEntries.reduce((a, b) => a + b, 0);
  const bar = dayEntries.map(n => n > 0 ? '█' : '·').join('');
  
  console.log(`   ${classId}: ${total.toString().padStart(3)} entries  [${bar}]  Mo:${dayEntries[0]} Di:${dayEntries[1]} Mi:${dayEntries[2]} Do:${dayEntries[3]} Fr:${dayEntries[4]}`);
});
console.log('');

// === Sample Data ===
console.log('🔍 Sample Data (HT11, Montag):');
const sampleEntries = data.classes.HT11?.mo || [];

if (sampleEntries.length === 0) {
  console.log('   ⚠️  No entries found');
} else {
  sampleEntries.slice(0, 5).forEach(entry => {
    const slot = `Slot ${entry.slotId}:`.padEnd(10);
    const subject = (entry.subject || '—').padEnd(30);
    const teacher = (entry.teacher || '—').padEnd(10);
    const room = (entry.room || '—').padEnd(5);
    
    console.log(`   ${slot} ${subject} ${teacher} [${room}]`);
  });
  
  if (sampleEntries.length > 5) {
    console.log(`   ... and ${sampleEntries.length - 5} more`);
  }
}
console.log('');

// === Data Quality Checks ===
console.log('✓ Data Quality Checks:');

let issues = [];

// Check for empty days
CLASSES.forEach(classId => {
  DAYS.forEach(day => {
    const entries = data.classes[classId][day] || [];
    if (entries.length === 0) {
      issues.push(`${classId} ${day}: No entries`);
    }
  });
});

// Check for missing data
let missingSubjects = 0;
let missingTeachers = 0;
let missingRooms = 0;

CLASSES.forEach(classId => {
  DAYS.forEach(day => {
    const entries = data.classes[classId][day] || [];
    entries.forEach(entry => {
      if (!entry.subject) missingSubjects++;
      if (!entry.teacher) missingTeachers++;
      if (!entry.room) missingRooms++;
    });
  });
});

if (missingSubjects > 0) {
  issues.push(`${missingSubjects} entries missing subject`);
}
if (missingTeachers > 0) {
  issues.push(`${missingTeachers} entries missing teacher`);
}
if (missingRooms > 0) {
  console.log(`   ℹ️  ${missingRooms} entries without room (this is OK)`);
}

if (issues.length === 0) {
  console.log('   ✅ All checks passed!');
} else {
  console.log('   ⚠️  Issues found:');
  issues.forEach(issue => {
    console.log(`     - ${issue}`);
  });
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// === Detailed View (Optional) ===
if (process.argv.includes('--detailed')) {
  console.log('📖 Detailed View - All Classes:');
  console.log('');
  
  CLASSES.forEach(classId => {
    console.log(`\n╔═══ ${classId} ═══╗`);
    
    DAYS.forEach(day => {
      const entries = data.classes[classId][day] || [];
      const dayLabel = day.toUpperCase().padEnd(2);
      
      if (entries.length === 0) {
        console.log(`  ${dayLabel}: —`);
        return;
      }
      
      console.log(`  ${dayLabel}:`);
      entries.forEach(entry => {
        const slot = `    ${entry.slotId}.`.padEnd(8);
        const subject = (entry.subject || '—').padEnd(30);
        const teacher = (entry.teacher || '—').padEnd(10);
        const room = entry.room ? `[${entry.room}]` : '';
        
        console.log(`${slot}${subject} ${teacher} ${room}`);
      });
    });
  });
  
  console.log('');
}

// === Export Summary ===
if (process.argv.includes('--export-summary')) {
  const summary = {
    parsed: new Date().toISOString(),
    source: jsonFile,
    meta: data.meta,
    classes: {}
  };
  
  CLASSES.forEach(classId => {
    summary.classes[classId] = {};
    DAYS.forEach(day => {
      summary.classes[classId][day] = (data.classes[classId][day] || []).length;
    });
  });
  
  const summaryFile = jsonFile.replace('.json', '-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`📄 Summary exported to: ${summaryFile}`);
}
