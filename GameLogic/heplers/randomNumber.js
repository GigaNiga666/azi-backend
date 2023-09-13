function randomNumber(max) {
  let rand = Math.random() * max;
  return Math.floor(rand);
}

module.exports = randomNumber