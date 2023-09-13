require('dotenv').config()
const cors = require('cors')
const express = require("express");
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server, {cors : {origin : process.env.FRONTEND_URL}})
require("./GameLogic/index").init(io);

const PORT = process.env.PORT && 5000

app.use(cors({
  origin: process.env.FRONTEND_URL
}))
app.use(express.json())

app.get('/', (req, res) => {
  res.json('Server work')
})

server.listen(PORT, () => {
  console.log('Server started on PORT: ' + PORT)
})




