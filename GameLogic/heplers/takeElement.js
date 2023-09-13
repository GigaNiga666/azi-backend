function takeElement(array, index) {
  return array[index >= array.length ? 0 : index < 0 ? array.length - 1 : index ]
}

module.exports = takeElement