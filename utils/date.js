function formatDate(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatDateTime(timestamp) {
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`
}

function getTodayDate() {
  return formatDate(Date.now())
}

module.exports = {
  formatDate,
  formatTime,
  formatDateTime,
  getTodayDate
}
