const shuffle = require("../heplers/shuffle");
const sleep = require("../heplers/sleep");
const randomNumber = require("../heplers/randomNumber").randomNumber;
const takeElement = require("../heplers/takeElement");
const {answerWebAppQueryHandler} = require("../TelegramBot");
let io;

const rooms = {}

function init(webSocket) {
  io = webSocket

  io.on('connection', socket => {
    socket.on('playerConnect', playerConnect)
    socket.on('disconnecting', disconnect)
    socket.on('move', move)
    socket.on('timerUpdate', (value, sessionId) => {
      if (value === 0) {
        kickPlayer(rooms[sessionId], this.id)
        this.leave(sessionId)
      }
      else io.to(sessionId).emit('timerUpdate', value)
    })
    socket.on('bet', bet)
  })
}

function disconnect() {
  for (const room of this.rooms) {
    if (room !== this.id) {
      kickPlayer(room, this.id)
      this.leave(room)
    }
  }
}

function kickPlayer(sessionId, id) {
  const room = rooms[sessionId]
  const player = room.players.find(player => player.id === id)
  const index = room.players.indexOf(player)
  const activePlayers = room.players.filter(player => player.active)

  if (room.dealer === player) {
    room.dealer = takeElement(activePlayers, index + 1)
  }

  if (player.move && room.gamePhase !== 'round') bet(0, 'pass', sessionId, id)
  else if (room.gamePhase === 'round') move(null, sessionId, id)

  room.players.splice(index, 1)

  const newActivePlayers = room.players.filter(player => player.active)

  if (newActivePlayers.length === 1) {
    newActivePlayers[0].coins += room.bank
    room.bank = 0
    newActivePlayers[0].action = null
    newActivePlayers[0].cards = []
    newActivePlayers[0].movedCard = null
    newActivePlayers[0].move = false
    if (room.players.length >= 2)
      initGamePhase(sessionId, newActivePlayers[0])
    else
      io.to(sessionId).emit('updatePlayers', room.players, null, room.bank)
  }
  else
    io.to(sessionId).emit('updatePlayers', room.players)

}

function playerConnect(sessionId, username, coins, minBet, queryId) {
  const room = io.sockets.adapter.rooms.get(sessionId)

  if (room === undefined) {
    this.join(sessionId)
    rooms[sessionId] = {
      players: [{username, coins, id: this.id, move: false, active: true, payoff: 0, bet: 0, queryId : queryId ? queryId : null}],
      minBet: minBet,
      bank: 0
    }
  } else if (room.size < 6 && coins >= rooms[sessionId].minBet) {
    const currentRoom = rooms[sessionId]
    const players = currentRoom.players

    this.join(sessionId)
    players.push({username, coins, id: this.id, move: false, active: false, payoff: 0, bet: 0, queryId : queryId ? queryId : null})

    if (room.size === 2) {
      players[players.length - 1].active = true
      io.to(sessionId).emit('updatePlayers', currentRoom.players)
      initGamePhase(sessionId)
    } else {
      io.to(sessionId).emit('updatePlayers', currentRoom.players, currentRoom.trumpedCard)
    }
  } else if (coins < rooms[sessionId].minBet) {
    answerWebAppQueryHandler(queryId, 'У вас недостаточно денег для ставок')
  } else {
    answerWebAppQueryHandler(queryId, 'Данная комната полная')
  }
}

function initGamePhase(sessionId, dealerPlayer = null) {
  const cards = initDeck('clubs')
  const room = rooms[sessionId]
  const players = room.players

  for (const player of players) {
    if (player.coins < room.minBet) {
      answerWebAppQueryHandler(player.queryId, 'У вас недостаточно денег для ставок')
    } else {
      player.bet = 0
      player.aziBet = 0
      player.coins -= room.minBet
      room.bank += room.minBet
      player.active = true
      player.cards = cardHandout(cards)
    }
    player.payoff = 0
  }

  room.dealer = dealerPlayer ? dealerPlayer : players[randomNumber(players.length)]
  room.dealer.move = true
  room.descBet = 0
  room.trumpedCard = cards.pop()
  room.gamePhase = 'blindTrade'
  room.dealerRaiseBet = false

  io.to(sessionId).emit('cardHandout', players, room.trumpedCard, room.minBet, room.bank)
}

function initAzi(sessionId, dealer) {
  const cards = initDeck('clubs')
  const room = rooms[sessionId]
  const players = room.players

  for (const player of players) {
    if (player.coins < room.minBet && player.action !== 'round') {
      answerWebAppQueryHandler(player.queryId, 'У вас недостаточно денег для ставок')
    } else {

      if (player.action !== 'round') {
        if (player.active) player.aziBet = room.bank / 2
        else player.aziBet = room.bank
      }
      else
        player.aziBet = 0

      player.bet = 0
      player.active = true
      player.cards = cardHandout(cards)
    }
    player.payoff = 0
  }

  room.gamePhase = 'azi'
  room.trumpedCard = cards.pop()
  const playersArray = players.filter(player => player.aziBet !== 0 || player === dealer)
  room.dealer = takeElement(playersArray, playersArray.indexOf(dealer) + 1)
  room.dealer.move = true
  room.descBet = 0

  io.to(sessionId).emit('cardHandout', players, room.trumpedCard, room.minBet, room.bank, room.dealer.aziBet)
}

function bet(betValue, action, sessionId, kickId) {
  const room = rooms[sessionId]

  if (room.gamePhase === 'azi') {
    const activePlayers = room.players.filter(player => player.active && player.aziBet !== 0)
    activePlayers.forEach((player, index) => {
      if ((kickId && player.id === kickId) || player.id === this.id) {
        let allIn;
        player.bet = betValue
        player.coins -= betValue
        player.move = false
        player.action = action
        room.bank += betValue

        if (room.descBet <= player.bet){
          room.descBet = player.bet
          room.dealer = player
        }

        const nextPlayer = takeElement(activePlayers, index + 1)

        allIn = nextPlayer.aziBet >= nextPlayer.coins

        if (nextPlayer.bet !== 0) {
          io.to(sessionId).emit('updatePlayers', room.players)
          room.dealer.move = true
          for (const player of room.players) {
            player.action = null
          }
          room.gamePhase = 'aziRound'
          sleep(1000).then(() => io.to(sessionId).emit('tradeEnd', room.players, room.bank))
        }
        else {
          nextPlayer.move = true
          io.to(sessionId).emit('bet', room.players, room.bank, nextPlayer.aziBet, nextPlayer.aziBet, room.descBet, false, allIn, false)
        }
      }
    })
  }
  else {
    const activePlayers = room.players.filter(player => player.active && player.coins !== 0)
    activePlayers.forEach((player, index) => {
      if ((kickId && player.id === kickId) || player.id === this.id) {
        let nextPlayer = takeElement(activePlayers, index + 1)
        let minRaise, maxRaise, allIn, canUpBet = true, isBlindTrade = room.gamePhase === 'blindTrade';

        if (player === room.dealer && player.bet !== 0 && !room.dealerRaiseBet) {
          room.dealerRaiseBet = true
        }

        player.bet += betValue
        player.coins -= betValue
        player.move = false
        player.action = action
        room.bank += betValue

        if (action === 'raise') {
          room.descBet = player.bet
          if (room.gamePhase === 'trade') room.dealer = player
        }
        else if (action === 'pass') { // TODO сделать чтобы небыло больше 3 сбросов
         if (kickId === undefined)
           if (isBlindTrade && player === room.dealer && !room.dealerRaiseBet) {
             for (const player of room.players) {
               player.action = null
             }
             takeElement(activePlayers, activePlayers.indexOf(room.dealer) + 1).move = true
             room.gamePhase = 'trade'
             room.dealerRaiseBet = false
             io.to(sessionId).emit('blindTradeEnd', room.players, room.bank, room.minBet)
             return
           }
           else if (isBlindTrade && room.dealerRaiseBet && player === room.dealer) {
             const nextPlayerBeginDealer = takeElement(activePlayers, activePlayers.indexOf(room.dealer) + 1)
             room.dealer = nextPlayerBeginDealer
             nextPlayer = nextPlayerBeginDealer
           }

          player.active = false
          player.bet = 0
          player.cards = []
          player.amountPass += 1
        }
        else if (action === 'allIn') {
          if (player.bet > room.descBet) {
            room.descBet = player.bet
            if (room.gamePhase === 'trade') room.dealer = player
          }
          else if (isBlindTrade) canUpBet = false
        }

        if ((nextPlayer.bet === room.descBet || nextPlayer === undefined) && room.descBet !== 0) {
          if (isBlindTrade) {
            io.to(sessionId).emit('updatePlayers', room.players)
            const selectNextPlayerArray = room.players.filter(player => (player.active && player.action !== 'allIn') || player === room.dealer)
            const nextPlayerMove = takeElement(selectNextPlayerArray, selectNextPlayerArray.indexOf(room.dealer) + 1).move = true
            for (const player of room.players) {
              player.action = null
            }

            if (nextPlayerMove === room.dealer) {
              room.gamePhase = 'round'
              sleep(1000).then(() => io.to(sessionId).emit('tradeEnd', room.players, room.bank))
            }
            else {
              room.gamePhase = 'trade'
              room.dealerRaiseBet = false
              sleep(1000).then(() => io.to(sessionId).emit('blindTradeEnd', room.players, room.bank, room.descBet))
            }
          }
          else {
            io.to(sessionId).emit('updatePlayers', room.players)
            for (const player of room.players) {
              player.action = null
            }
            room.gamePhase = 'round'
            room.dealer.move = true
            sleep(1000).then(() => io.to(sessionId).emit('tradeEnd', room.players, room.bank))
          }
          return
        }

        if ((isBlindTrade && action === 'call' && nextPlayer !== room.dealer) || (room.dealerRaiseBet)) {
          canUpBet = false
        }

        nextPlayer.move = true
        const canCallValue = room.descBet !== 0
        if (room.descBet >= nextPlayer.coins) {
          allIn = true
        }
        else if (isBlindTrade){
          minRaise = room.descBet === 0 ? room.minBet : room.descBet + room.minBet
          maxRaise = room.descBet === 0 ? room.minBet * 5 : room.descBet * 2
        }
        else {
          minRaise = room.descBet === 0 ? room.minBet : room.descBet * 2
          maxRaise = room.descBet === 0 ? room.minBet * 5 : room.descBet * 5
        }

        if (!allIn && minRaise > nextPlayer.coins) minRaise = nextPlayer.coins
        if (!allIn && maxRaise > nextPlayer.coins) maxRaise = nextPlayer.coins

        io.to(sessionId).emit('bet', room.players, room.bank, minRaise, maxRaise, room.descBet, canCallValue, allIn, canUpBet)

        if (player.amountPass === 2) {
          answerWebAppQueryHandler(player.queryId, 'Вы слишком много раз отказывались от ставок')
        }
      }
    })
  }
}

function initDeck(outSuit) {
  const suits = ['diamonds', 'hearts', 'clubs', 'spades'].filter(suit => suit !== outSuit)
  const cards = []

  for (const suit of suits) {
    for (let i = 6; i < 15; i++) {
      cards.push({suit, value: i})
    }
  }

  shuffle(cards)
  return cards
}

function cardHandout(cards) {
  const playerCards = []

  for (let i = 0; i < 3; i++) {
    playerCards.push(cards.pop())
  }

  return playerCards
}

function move(card, sessionId, id) {
  const activePlayers = rooms[sessionId].players.filter(player => player.active)

  activePlayers.forEach((player, index) => {
    if ((id && player.id === id) || player.id === this.id) {
      const nextPlayer = takeElement(activePlayers, index + 1)
      player.movedCard = card
      player.cards = player.cards.filter(playerCard => !(playerCard.suit === card.suit && playerCard.value === card.value))
      player.move = false
      if (nextPlayer !== rooms[sessionId].dealer) {
        nextPlayer.move = true
        io.to(sessionId).emit('move', rooms[sessionId].players, rooms[sessionId].dealer.movedCard.suit, rooms[sessionId].trumpedCard.suit)
      } else {
        io.to(sessionId).emit('move', rooms[sessionId].players)
        endRound(sessionId)
      }
    }
  })
}

function endRound(sessionId) {
  const players = rooms[sessionId].players.filter(player => player.active)
  const trumpedSuit = rooms[sessionId].trumpedCard.suit;
  const trumpedCardPlayer = players.find(player => player.movedCard.suit === trumpedSuit)
  let highestCard, highestCardPlayer, comparedSuit;

  if (trumpedCardPlayer) {
    highestCard = trumpedCardPlayer.movedCard
    highestCardPlayer = trumpedCardPlayer
    comparedSuit = trumpedSuit
  } else {
    highestCard = rooms[sessionId].dealer.movedCard
    highestCardPlayer = rooms[sessionId].dealer
    comparedSuit = rooms[sessionId].dealer.movedCard.suit
  }

  for (const player of players) {
    const movedCard = player.movedCard
    if (movedCard.suit === comparedSuit && movedCard.value > highestCard.value) {
      highestCard = movedCard
      highestCardPlayer = player
    }
  }

  highestCardPlayer.payoff++
  sleep(500).then(() => {
    for (const player of players) {
      player.movedCard = null
    }

    if (!highestCardPlayer.cards.length && players.filter(player => player.payoff === 1).length === 3) {
      highestCardPlayer.action = 'round'
      io.to(sessionId).emit('roundEnd', `Ази`, rooms[sessionId].players, rooms[sessionId].bank)
      initAzi(sessionId, highestCardPlayer)
      return
    }

    if (highestCardPlayer.payoff === 1) {
      rooms[sessionId].dealer = highestCardPlayer
      highestCardPlayer.action = 'round'
      highestCardPlayer.move = true
      io.to(sessionId).emit('roundEnd', `Выиграл ставку игрок: ${highestCardPlayer.username}`, rooms[sessionId].players, rooms[sessionId].bank)
    } else {
      highestCardPlayer.action = 'win'
      io.to(sessionId).emit('updatePlayers', rooms[sessionId].players)

      sleep(1000).then(() => {
        for (const player of players) {
          player.action = null
        }

        if (rooms[sessionId].gamePhase === 'aziRound' && highestCardPlayer.aziBet === 0 && highestCardPlayer.coins === 0) {
          highestCardPlayer.coins += rooms[sessionId].bank
          rooms[sessionId].bank = 0
        }
        else if (highestCardPlayer.coins === 0) {
          const winCoins = Math.round(rooms[sessionId].bank * (Math.trunc(highestCardPlayer.bet /  rooms[sessionId].descBet * 100) / 100) / 10 ) * 10
          highestCardPlayer.coins = winCoins
          rooms[sessionId].bank -= winCoins
        }
        else {
          highestCardPlayer.coins += rooms[sessionId].bank
          rooms[sessionId].bank = 0
        }

        io.to(sessionId).emit('roundEnd', `Раунд выиграл: ${highestCardPlayer.username}`, rooms[sessionId].players, rooms[sessionId].bank)
        initGamePhase(sessionId, highestCardPlayer)
      })
    }
  })
}

module.exports = {init}