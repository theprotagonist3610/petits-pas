/** Événement d'une journée entière pour l'agenda du téléphone (format iCalendar). */
export interface CalendarEvent {
  uid: string
  /** Date ISO (AAAA-MM-JJ). */
  date: string
  title: string
  description?: string
}

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const compact = (iso: string) => iso.replace(/-/g, '')

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Fichier .ics avec un rappel la veille à 18 h. */
export function createIcs(event: CalendarEvent, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Petits Pas//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}@petits-pas`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(event.date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(event.date))}`,
    `SUMMARY:${escape(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(event.title)}`,
    'TRIGGER:-PT6H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(event: CalendarEvent, filename: string) {
  const url = URL.createObjectURL(new Blob([createIcs(event)], { type: 'text/calendar;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
