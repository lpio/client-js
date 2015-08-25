import Emitter from 'emitter-component'
import Backoff from 'backo'
import Multiplexer from 'lpio-multiplexer-js'

import request from './request'

export default class Client extends Emitter {
  static DEFAULTS = {
    id: undefined,
    url: '/lpio',
    disconnectedAfter: 5,
    multiplex: undefined,
    backoff: undefined,
    ackTimeout: 10000
  }

  constructor(options) {
    super()
    this.options = { ...Client.DEFAULTS, ...options}
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

  send(options, callback) {
    let err

    if (!options.data) err = new Error('Data is undefined.')
    if (!options.recipient) err = new Error('Recipient is undefined.')

    if (err) return setTimeout(callback.bind(null, err))

    let message = {
      id: uid(),
      type: 'user',
      client: this.id,
      sender: this.options.user,
      ...options
    }

    this.multiplexer.add(message)

    if (callback) {
      let timeoutId
      let onAck = () => {
        clearTimeout(timeoutId)
        callback()
      }
      this.once(`ack:${message.id}`, onAck)
      timeoutId = setTimeout(() => {
        this.off(`ack:${message.id}`, onAck)
        callback(new Error('Delivery timeout.'))
      }, this.options.ackTimeout)
    }
    return this
  }

  open(messages = []) {
    if (this.loading && messages.length) {
      // Never loose messages, even if right now this situation should
      // not possible, its better to handle them always.
      this.multiplexer.add(messages)
      return
    }

    this.loading = true

    this.request = request({
      url: this.options.url,
      data: {
        client: this.options.id,
        messages: messages
      },
      success: ::this.onRequestSuccess,
      error: this.onRequestError.bind(this, messages),
      close: ::this.onRequestClose
    })
  }

  reopen(messages) {
    setTimeout(() => {
      this.open(messages)
    }, this.backoff.duration())
  }

  onRequestClose() {
    this.request = undefined
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

  onRequestError(messages, xhr) {
    this.emit('error', new Error(xhr.responseText))
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
      id: message.id,
      client: this.id,
      sender: this.options.user
    })
    this.emit('message', message)
  }

  onDrain(messages) {
    if (this.request) this.request.abort()
    this.open(messages)
  }
}

function uid() {
  return String(Math.round(Math.random() * Date.now()))
}
