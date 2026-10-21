// Calendar day (YYYY-MM-DD) of a date in the user's timezone. The server runs
// in UTC, so "today" must be resolved against the trader's own clock.
const dayKey = (date, timeZone) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

module.exports = { dayKey };
