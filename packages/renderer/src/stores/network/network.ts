/* eslint-disable @typescript-eslint/adjacent-overload-signatures */
import { randomInt } from 'crypto'
import { ref } from 'vue'
import { pushConfirm, pushNewLoading, pushUINewNotif, rmLoading } from '../UI/ui'
import router from '../../router'
import * as dntp from '../mapAPI/dntpService'
import * as engineMgr from '../engineManager/engine'
import type { Confirmation, Game, GameBrief, Notification, PING, StateMessage, User } from './interfaces'

let ws: WebSocket
export const ws_open = ref<boolean>(false)
let wdir: string
const mapsBeingDownloaded: number[] = []
let lastGame: Game | null
const hpChecker: any[] = []

export const clientHP = ref(3)
export const gameListing = ref<GameBrief[]>()
export const joinedGame = ref<Game | null>()
export const username = ref('')
export const userState = ref({ isLoggedIn: false })
export const userDetail = ref<User>()
export const confirmations = ref<Confirmation[]>()

const password = ref('')
export const minimapFileName = ref('')

// initNetWork()

export function initNetWork(isRe = false) {
  clientHP.value = 3
  ws = new WebSocket('ws://144.126.145.172:8081')
  ws.onmessage = (ev) => {
    let msg: StateMessage | Notification | PING = JSON.parse(ev.data)
    if (msg.action === undefined)
      return

    if (msg.action === 'PING') {
      msg = msg as PING
      ws.send(JSON.stringify({
        action: 'PONG',
        parameters: {},
      }))
      clientHP.value = 3
      // console.log('received ping')
      return
    }
    // console.log({ msg })

    if (msg.action === 'NOTIFY') {
      msg = msg as Notification
      console.log(msg)
      pushConfirm(msg.action, msg.message, true, false).then()
      return
    }

    msg = msg as StateMessage

    console.log(msg)

    // login section
    writeLoginStats()

    // chat section
    writeChatStats(msg)
    userDetail.value = msg.state.user 
    joinedGame.value = msg.state.user.game
    gameListing.value = msg.state.games

    username.value = msg.state.user.username
    // confirmations:
    confirmations.value = msg.state.user.confirmations
    // console.log(confirmations.value)
    // const mapBeingDownloaded = joinedGame.value.mapId
    writeMapStats(msg)
    writeStartGameStats(msg)
    lastGame = joinedGame.value
    writeMIDGameStats(msg)
  }

  ws.onopen = () => {
    ws_open.value = true
    // console.log('ws is open')
    if (isRe)
      login({ username: username.value, password: password.value })
  }

  ws.onclose = () => {
    // console.log('server closed connection')
    ws_open.value = false
    userState.value.isLoggedIn = false
    pushConfirm('NEURAL CONNECTION LOST', 'RECONNECTION CONFIRM').then(() => {
      initNetWork(true)
    },
    () => {
      // console.log('logged out')
      ws.close()
      pushUINewNotif({ title: 'IDENT', msg: 'NEURAL CONNECTION DESTROYED', class: 'aaa' })
    })
  }

  hpChecker.push(setInterval(() => {
    if (clientHP.value <= 0) {
      ws.close()
      clearInterval(hpChecker[0])
      hpChecker.shift()
      // console.log('closing network')
    }

    clientHP.value--
  }, 3000))
}
function writeLoginStats() {
  if (userState.value.isLoggedIn === false) {
    joinChat({
      chatName: 'global',
      password: '',
    })
    setTimeout(() => {
      router.push('postlogin')
    }, 7000)

    userState.value.isLoggedIn = true
  }
}

export const chatLog = ref<{ author: string;msg: string;chatName: string;timestamp: number }[]>([])
export const joinedChannels = ref<string[]>([])
export const unreadChannel = ref<string[]>([])

function writeChatStats(msg: StateMessage) {
  // const tmpChannels = Object.keys(msg.state.user.chatRooms)
  // joinedChannels.value = tmpChannels // composes joined channel
  joinedChannels.value = []
  for (const channel in msg.state.user.chatRooms) {
    joinedChannels.value.push(channel)
    const lastMessage = msg.state.user.chatRooms[channel].lastMessage
    if (lastMessage.content !== '') {
      chatLog.value.push({
        author: lastMessage.author,
        msg: lastMessage.content,
        timestamp: Date.now(),
        chatName: channel,
      })
      unreadChannel.value.push(channel)
      while (chatLog.value.length > 100) chatLog.value.shift()
    }
  }
}

function writeMapStats(msg: StateMessage) {
  if (!msg.state.user.game)
    return
  const mapBeingDownloaded = msg.state.user.game.mapId
  if (mapsBeingDownloaded.includes(mapBeingDownloaded))
    return
  
  if(msg.state.user.game.players[username.value].hasmap)
    return

  mapsBeingDownloaded.push(mapBeingDownloaded)

  pushNewLoading('loadingMiniMap')
  // pushUINewNotif({ title: 'INTL', msg: 'Operation Intl Updated', class: 'aaa' })
  dntp.getMiniMapfromID(mapBeingDownloaded, wdir).then((filename) => {
    minimapFileName.value = filename
    rmLoading('loadingMiniMap')
    dntp.getMapActualFile(mapBeingDownloaded, wdir).then(() => {
      const index = mapsBeingDownloaded.indexOf(mapBeingDownloaded)
      if (index > -1) { // only splice array when item is found
        mapsBeingDownloaded.splice(index, 1) // 2nd parameter means remove one item only
      }

     hasMap({
          mapId: mapBeingDownloaded,
        })
        
      
    })
  })
}
function writeStartGameStats(msg: StateMessage) {
  // console.log(joinedGame.value)
  if (!msg.state.user.game)
    return
  if (!lastGame)
    return
  if (msg.state.user.game.isStarted && (!lastGame.isStarted)) {
    engineMgr.configureToLaunch({
      /* host: msg.state.user.game.responsibleAutohost.slice(7), */
      host: msg.state.user.game.responsibleAutohost,
      port: msg.state.user.game.autohostPort,
      permittedUsername: username.value,
      token: msg.state.user.game.engineToken,
    })
  }
}

function writeMIDGameStats(msg: StateMessage) {
  // console.log(joinedGame.value)
  if (!msg.state.user.game)
    return
  if (msg.action === 'MIDJOINED') {
    engineMgr.configureToLaunch({
      /* host: msg.state.user.game.responsibleAutohost.slice(7), */
      host: msg.state.user.game.responsibleAutohost,
      port: msg.state.user.game.autohostPort,
      permittedUsername: username.value,
      token: msg.state.user.game.engineToken,
    })
  }
}
export function login(params: {
  username: string
  password: string
}) {
  if (ws_open.value !== true) {
    window.console.log('ws not opened')
    return
  }

  const tx = {
    action: 'LOGIN',
    parameters: {
      username: params.username,
      password: params.password,
    },
    seq: randomInt(0, 1000000),
  }
  username.value = params.username

  password.value = params.password
  wsSendServer(tx)
}

export function joinChat(params: {
  chatName: string
  password: string
}) {
  const tx = {
    action: 'JOINCHAT',
    parameters: {
      chatName: params.chatName,
      password: params.password,
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function leaveChat(params: {
  chatName: string
}) {
  const tx = {
    action: 'LEAVECHAT',
    parameters: {
      chatName: params.chatName,
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function setMap(params: { game: string
  mapId: number
}) {
  const tx = {
    action: 'SETMAP',
    parameters: {
      gameName: params.game,
      mapId: params.mapId,
    },
    seq: randomInt(0, 10000000),
  }
  wsSendServer(tx)
}

export function confirmEmail(params: { confirmationId: number
  type: string
  agree: boolean

}) {
  const tx = {
    action: 'CLAIMCONFIRM',
    parameters: {
      confirmationId: params.confirmationId,
      type: params.type,
      agree: params.agree,
    },
    seq: randomInt(0, 10000000),
  }
  wsSendServer(tx)
}

export function sayChat(params: {
  chatName: string
  msg: string
}) {
  const tx = {
    action: 'SAYCHAT',
    parameters: {
      chatName: params.chatName,
      message: params.msg,
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function joinGame(params: {
  gameName: string|null|undefined
  password: string
  mapID: string
}) {
  const tx = {
    action: 'JOINGAME',
    parameters: {
      gameName: params.gameName,
      password: params.password,
      mapId: params.mapID,
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function leaveGame() {
  const tx = {
    action: 'LEAVEGAME',
    parameters: {
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function createAdv() {
  const tx = {
    action: 'ADV_CREATE',
    parameters: {
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function ADV_RECRUIT(friendName: string) {
  const tx = {
    action: 'ADV_RECRUIT',
    parameters: {
        friendName,
    },
    seq: randomInt(0, 1000000)
}
  wsSendServer(tx)
}

export function forfeit(){

const tx =   {
  action: 'ADV_FORFEIT',
  parameters: {
  },
  seq: randomInt(0, 1000000)
}

wsSendServer(tx)
}

export function setAIorChicken(params: {
  gameName: string
  AI: string
  team: string
  type: string
}) {
  const tx = {
    action: 'SETAI',
    parameters: {
      gameName: params.gameName,
      AI: params.AI,
      team: params.team,
      type: params.type,
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function delAIorChicken(params: {
  gameName: string
  AI: string
  type: string
}) {
  const tx = {
    action: 'DELAI',
    parameters: {
      gameName: params.gameName,
      AI: params.AI,
      type: params.type,
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function setTeam(params: {
  gameName: string
  team: string
  player: string
}) {
  const tx = {
    action: 'SETTEAM',
    parameters: {
      gameName: params.gameName,
      team: params.team,
      player: params.player,
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function specPlayer(params: {
  game: string
  player: string
}) {
  const tx = {
    action: 'SETSPEC',
    parameters: {
      gameName: params.game,
      player: params.player,
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function hasMap(params: {
  mapId: number
}) {
  const tx = {
    action: 'HASMAP',
    parameters: {
      mapId: params.mapId,
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function addFriend(params: {
  friendName: string
}) {
  const tx = {
    action: 'ADDFRIEND',
    parameters: {
      friendName: params.friendName,
    },
    seq: randomInt(0, 1000000),
  }
  pushUINewNotif({ title: 'FRND', msg: 'Friend Request Sent', class: 'aaa' })
  wsSendServer(tx)
}

export function setMod(params: {
  mod: string
}) {
  const tx = {
    action: 'SETMOD',
    parameters: {
      mod: params.mod,
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function startGame() {
  const tx = {
    action: 'STARTGAME',
    parameters: {
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function killGame() {
  const tx = {
    action: 'KILLENGINE',
    parameters: {
    },
    seq: randomInt(0, 1000000),
  }

  wsSendServer(tx)
}

export function midJoin() {
  const tx = {
    action: 'MIDJOIN',
    parameters: {
    },
    seq: randomInt(0, 1000000),
  }
  wsSendServer(tx)
}

export function wsSendServer(tx: {
  action: string
  parameters: any
  seq: number
}) {
  if (ws_open.value !== true) {
    console.error('ws is not open')
    return
  }
  // console.log(tx)
  ws.send(JSON.stringify(tx))
}

export function setWDir(input: string) {
  wdir = input
}
