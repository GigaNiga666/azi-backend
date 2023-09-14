function randomNumber(max) {
  let rand = Math.random() * max;
  return Math.floor(rand);
}

function randomIntegerMinMax(min, max) {
  // случайное число от min до (max+1)
  let rand = min + Math.random() * (max + 1 - min);
  return Math.floor(rand);
}

module.exports = {randomNumber, randomIntegerMinMax}