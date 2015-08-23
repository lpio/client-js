import Emitter from 'emitter-component'
import Backoff from 'backo'

import Multiplexer from './Multiplexer'
import request from './request'

export default class Client extends Emitter {
  static DEFAULTS = {
    id: undefined,
    url: '/lpio',
    disconnectedAfter: 5,
    multiplex: undefined,
    backoff: undefined
  }

  constructor(options) {
    this.options = {...options, ...Client.DEFAULTS}
    this.loading = false
    this.connected = false
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.multiplexer.on('drain', ::this.onDrain)
    this.backoff = new Backoff(this.options.backoff)
  }

  connect() {
    if (this.connected || this.loading) return this
    this.open()
    return this
  }

  send(message, callback) {
    this.multiplexer.add(message)
    this.once(`ack:${message.id}`, callback)
    return this
  }

  open(messages) {
    if (this.loading) {
      // Never loose messages, even if right now this situation should
      // not possible, its better to handle them always.
      this.multiplexer.add(messages)
      return
    }

    this.loading = true

    request({
      url: this.options.url,
      data: {
        client: this.options.id,
        messages: messages
      },
      complete: ::this.onRequestComplete,
      success: ::this.onRequestSuccess,
      error: this.onRequestError.bind(this, messages)
    })
  }

  reopen(messages) {
    setTimeout(() => {
      this.open(messages)
    }, this.backoff.duration())
  }

  onRequestComplete() {
    this.loading = false
  }

  onRequestSuccess(res) {
    this.backoff.reset()
    if (!this.connected) {
      this.connected = true
      this.emit('connected')
    }
    res.messages.forEach(::this.onMessage)
  }

  onRequestError(messages) {
    if (this.connected &&
      this.backoff.attempts > this.options.disconnectedAfter) {
      this.connected = false
      this.emit('disconnected')
    }
    this.reopen(messages)
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

  onDrain(messages) {
    this.open(messages)
  }
}
