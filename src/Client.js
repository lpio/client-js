import Emitter from 'emitter-component'
import Multiplexer from './Multiplexer'
import Backoff from 'backo'

export default class Client extends Emitter {
  static DEFAULTS = {
    id: undefined,
    uri: '/lpio',
    disconnectedAfter: 5,
    multiplex: undefined,
    backoff: undefined
  }

  constructor(options) {
    this.options = {...options, ...Client.DEFAULTS}
    this.opened = false
    this.connected = false
    this.connecting = false
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.multiplexer.on('drain', ::this.onDrain)
    this.backoff = new Backoff(this.options.backoff)
  }

  connect() {
    if (this.connected || this.connecting) return this
    this.connecting = true
    this.open()
    return this
  }

  send(message, callback) {
    this.multiplexer.add(message)
    this.once(`ack:${message.id}`, callback)
    return this
  }

  open(messages) {
    if (this.opened) {
      // Never loose messages, even if right now this situation is not possible,
      // its better to schedule them always.
      this.multiplexer.add(messages)
      return
    }

    this.opened = true

    request({
      uri: this.options.uri,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json;charset=UTF-8'
      },
      method: 'POST',
      data: {
        client: this.options.id,
        messages: messages
      },
      success: ::this.onRequestSuccess,
      error: this.onRequestError.bind(this, messages)
    })
  }

  reopen(messages) {
    this.connecting = true
    setTimeout(() => {
      this.open(messages)
    }, this.backoff.duration())
  }

  onRequestSuccess(res) {
    this.opened = false
    this.onConnect()
    res.messages.forEach(::this.onMessage)
  }

  onMessage(message) {
    if (message.type === 'ack') {
      this.emit(`ack:${message.id}`)
      return
    }

    // We got a user message, lets schedule an confirmation.
    this.multiplexer.add({
      type: 'ack',
      id: message.id
    })
    this.emit('message', message)
  }

  onRequestError(messages) {
    this.opened = false
    this.onDisconnect()
    this.reopen(messages)
  }

  onDisconnect() {
    if (!this.connected &&
      this.backoff.attempts > this.options.disconnectedAfter) {
      this.emit('disconnected')
    }
  }

  onConnect() {
    this.connecting = false
    this.connected = true
    this.backoff.reset()
    if (!this.connected) this.emit('connected')
  }

  onDrain(messages) {
    this.open(messages)
  }
}
