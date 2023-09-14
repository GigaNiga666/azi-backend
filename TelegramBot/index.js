const {Telegraf, session, Markup, Telegram} = require('telegraf')
const {Stage, BaseScene} = require('telegraf/scenes')
const {randomIntegerMinMax} = require("../heplers/randomNumber");

const telegram = new Telegram('6480752376:AAH_0LcP37blYMNtXiaDZlx6rRvemi0UKbY', {});



const getUsernameScene = new BaseScene('getUsername')
getUsernameScene.enter((ctx) => ctx.reply('Отправь id комнаты'))
getUsernameScene.on('text', (ctx) => {
  ctx.reply('Ваша комната:', Markup.inlineKeyboard([
    Markup.button.webApp('Подключиться', `https://azi-frontend.vercel.app/${ctx.message.text}?name=${ctx.from.username + '222'}&coins=10000&minBet=50`),
  ]))
  ctx.scene.leave()
})

const bot = new Telegraf('6480752376:AAH_0LcP37blYMNtXiaDZlx6rRvemi0UKbY')
const stage = new Stage([getUsernameScene])

bot.use(session())
bot.use(stage.middleware())

bot.start((ctx) => {
  ctx.reply(`Выберете действие:`, Markup.inlineKeyboard([
    Markup.button.webApp('Создать комнату', `https://azi-frontend.vercel.app/${randomIntegerMinMax(1000,9999)}?name=${ctx.from.username}&coins=10000&minBet=50`),
    Markup.button.callback('Подключиться к комнате', 'connectRoom'),
  ]))
})
bot.on('message', ctx => ctx.reply('What?'))
bot.action('connectRoom', (ctx) => ctx.scene.enter('getUsername'))

async function startBot() {
  bot.launch()
}

async function answerWebAppQueryHandler(queryId, msg) {
  await telegram.answerWebAppQuery(queryId, {
    type:'article',
    id: queryId,
    title: 'Результаты игры',
    input_message_content: {
      message_text: msg
    }
  })
}

module.exports = {startBot, answerWebAppQueryHandler}