import { DurableObject } from 'cloudflare:workers'
import * as rendezvous from './hbbs-rendezvous'

export class Hbbr extends DurableObject {
  // In-memory state
  initiator: WebSocket | undefined
  accaptor: WebSocket | undefined

  async fetch(_req: Request): Promise<Response> {
    // console.log(`hbbr fetch ${req.url}`)
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)
    this.ctx.acceptWebSocket(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (this.initiator === socket) {
      // message from initiator, forward to acceptor
      if (this.accaptor && this.accaptor.readyState === 1) {
        this.accaptor.send(message)
      }
      return
    }
    if (this.accaptor === socket) {
      // message from acceptor, forward to initiator
      if (this.initiator && this.initiator.readyState === 1) {
        this.initiator.send(message)
      }
      return
    }

    // new connection message
    if (message instanceof ArrayBuffer) {
      const msg = rendezvous.RendezvousMessage.fromBinary(new Uint8Array(message))
      // console.log(`rendezvous relay received ${message.byteLength}`, msg)
      switch (msg.union?.oneofKind) {
        case 'requestRelay':
          this.handleRelayRequest(msg.union.requestRelay, socket)
          break
        default:
          console.log(`unsupported relay msg type: ${msg.union?.oneofKind}`)
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    ws.close(code, "client closed")
    if (this.accaptor) {
      this.accaptor.close(code, "peer closed")
    }
    if (this.initiator) {
      this.initiator.close(code, "peer closed")
    }
  }

  handleRelayRequest(req: rendezvous.RequestRelay, socket: WebSocket) {
    if (!this.initiator) {
      this.initiator = socket
      console.log(`setup initiator relay request uuid: ${req.uuid}`)
      return
    }
    if (this.initiator === socket) {
      return
    }
    if (!this.accaptor) {
      this.accaptor = socket
      console.log(`setup accaptor relay request uuid: ${req.uuid}`)
    }
  }
}

export class Hbbs extends DurableObject {
  // In-memory state
  sessions: Map<string, {
    id: string,
    uuid: string,
    socket: WebSocket,
  }> = new Map()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // We will track metadata for each client WebSocket object in `sessions`.
    this.sessions = new Map()
    ctx.getWebSockets().forEach((webSocket) => {
      // The constructor may have been called when waking up from hibernation,
      // so get previously serialized metadata for any existing WebSockets.
      const meta = webSocket.deserializeAttachment()
      if (!meta) {
        // console.log('hbbr no meta on websocket', webSocket)
        return
      }
      meta.socket = webSocket

      // We don't send any messages to the client until it has sent us the initial user info
      // message. Until then, we will queue messages in `session.blockedMessages`.
      // This could have been arbitrarily large, so we won't put it in the attachment.
      this.sessions.set(meta.id, meta)
    })
  }

  async fetch(_req: Request): Promise<Response> {
    // console.log(`hbbs fetch ${req.url}`)
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    // Calling `acceptWebSocket()` connects the WebSocket to the Durable Object, allowing the WebSocket to send and receive messages.
    // Unlike `ws.accept()`, `state.acceptWebSocket(ws)` allows the Durable Object to be hibernated
    // When the Durable Object receives a message during Hibernation, it will run the `constructor` to be re-initialized
    this.ctx.acceptWebSocket(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  // receiving a message from the client
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message instanceof ArrayBuffer) {
      const msg = rendezvous.RendezvousMessage.fromBinary(new Uint8Array(message))
      // const meta = ws.deserializeAttachment()
      // console.log(`rendezvous received ${message.byteLength} from ${meta?.id}`, msg)
      switch (msg.union?.oneofKind) {
        case 'registerPk':
          this.handleRegisterPk(msg.union.registerPk, ws)
          break
        case 'onlineRequest':
          this.handleOnlineRequest(msg.union.onlineRequest, ws)
          break
        case 'punchHoleRequest':
          this.handlePunchHoleRequest(msg.union.punchHoleRequest, ws)
          break
        case 'relayResponse':
          this.handleRelayResponse(msg.union.relayResponse, ws)
          break
        default:
          console.log(`unsupported msg type: ${msg.union?.oneofKind}`)
      }
      return
    }
    // close the connection for unsupported message type
    ws.close()
  }

  // client closes the connection, the runtime will invoke the webSocketClose() handler.
  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    ws.deserializeAttachment()
    const meta = ws.deserializeAttachment()
    if (meta) {
      this.sessions.delete(meta.id)
      console.log(`rendezvous client closed id: ${meta.id} uuid: ${meta.uuid}`)
    }
    ws.close(code, "client closed")
  }

  sendRendezvous(data: unknown, socket: WebSocket | undefined) {
    if (!data) {
      return
    }
    if (!socket || socket.readyState != 1) {
      console.log('sendRendezvous socket not open')
      return
    }
    const type = Object.keys(data)[0]
    const msg = {
      union: {
        oneofKind: type,
        ...data
      }
    } as rendezvous.RendezvousMessage
    // const meta = socket.deserializeAttachment()
    // console.log(`Sending rendezvous to ${meta?.id}:`, msg)
    socket.send(rendezvous.RendezvousMessage.toBinary(msg))
  }

  handleRelayResponse(res: rendezvous.RelayResponse, _socket: WebSocket) {
    console.log(`Handling relay response: ${res.version}`)
  }

  handlePunchHoleRequest(req: rendezvous.PunchHoleRequest, socket: WebSocket) {
    const targetId = req?.id
    console.log(`Handling punch hole request to id: ${targetId}`)
    if (!targetId) {
      this.sendRendezvous({
        punchHoleResponse: rendezvous.PunchHoleResponse.create({
          otherFailure: 'invalid request'
        })
      }, socket)
      return
    }
    const onlineSession = this.sessions.get(targetId)
    if (!onlineSession) {
      this.sendRendezvous({
        punchHoleResponse: rendezvous.PunchHoleResponse.create({
          failure: 0,
          otherFailure: 'target not online'
        })
      }, socket)
      return
    }

    const relayUrl = (this.env as { HBBS_RELAY_URL?: string }).HBBS_RELAY_URL || 'ws://localhost'
    const uuid = crypto.randomUUID()
    this.sendRendezvous({
      requestRelay: rendezvous.RequestRelay.create({
        id: targetId,
        uuid: uuid,
        relayServer: `${relayUrl}/ws/relay/${uuid}`,
      })
    }, onlineSession.socket)
    this.sendRendezvous({
      relayResponse: rendezvous.RelayResponse.create({
        uuid: uuid,
        relayServer: `${relayUrl}/ws/relay/${uuid}`,
        version: '1.4.3',
      })
    }, socket)
  }

  handleRegisterPk(req: rendezvous.RegisterPk, socket: WebSocket) {
    const peerId = req?.id
    const peerUuid = new TextDecoder().decode(req?.uuid)
    console.log(`Handling register pk id: ${peerId} uuid: ${peerUuid}`)
    if (!peerId) {
      socket.close()
      return
    }
    socket.serializeAttachment({
      id: peerId,
      uuid: peerUuid,
    })
    this.sessions.set(peerId, {
      id: peerId,
      uuid: peerUuid,
      socket: socket
    })
    this.sendRendezvous({
      registerPkResponse: rendezvous.RegisterPkResponse.create({
        result: 0,
        keepAlive: 60,
      })
    }, socket)
  }

  handleOnlineRequest(req: rendezvous.OnlineRequest, socket: WebSocket) {
    const peerId = req?.id
    console.log(`Handling online request id: ${peerId} peers: ${req?.peers}`)
    if (!peerId) {
      return
    }
    // TODO fill up online peers states
    const states = new Uint8Array(req.peers.length)
    states.fill(0)
    this.sendRendezvous({
      onlineResponse: rendezvous.OnlineResponse.create({
        states
      })
    }, socket)
  }

}
