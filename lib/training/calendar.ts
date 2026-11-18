function calendarDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}`
}

export function trainingCalendar(date: Date, createdAt: Date): string {
  const start = calendarDay(date)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  const stamp = createdAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chessics//Training//EN',
    'BEGIN:VEVENT',
    `UID:training-${start}@chessics.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${calendarDay(end)}`,
    'SUMMARY:Practise positions from your games',
    'URL:https://chessics.com/train',
    'DESCRIPTION:Open training at https://chessics.com/train',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
