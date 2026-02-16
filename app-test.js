// Quick test to create the updated render functions
// This will be merged into the actual app.js

function renderTimetable() {
  const classId = state.els.classSelect?.value || 'HT11';
  const dayId = state.els.daySelect?.value || 'mo';
  const rows = state.timetable?.[classId]?.[dayId] || [];
  const body = state.els.timetableBody;
  if (!body) return;
  const bySlot = new Map(rows.map((r) => [r.slotId, r]));
  body.innerHTML = state.timeslots
    .map((s) => {
      const r = bySlot.get(s.id);
      const subject = r?.subject || '—';
      const teacher = formatTeacherName(r?.teacher);
      const room = r?.room || '—';
      return `
        <div class="tr" role="row" aria-label="${escapeHtml(s.time)}">
          <div class="td"><span class="time">${escapeHtml(s.time)}</span></div>
          <div class="td">${escapeHtml(subject)}</div>
          <div class="td">${escapeHtml(teacher)}</div>
          <div class="td">${escapeHtml(room)}</div>
        </div>
      `;
    })
    .join('');
}
